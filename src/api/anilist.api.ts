// src/api/anilist.api.ts

import { createError, ErrorCode, logError, normalizeError } from '@/utils/error-handling';
import { logger } from '@/utils/logger';
import type { AniFormat, AniTitles, ExtensionError } from '@/types';

export type AniMedia = {
  id: number;
  format: AniFormat | null;
  title: AniTitles;
  startDate?: { year?: number | null };
  synonyms: string[];
  relations?: {
    edges: {
      relationType: string;
      node: AniMedia;
    }[];
  };
};

type FindMediaResponse = {
  data?: { Media?: AniMedia };
  errors?: { message: string; status: number }[];
};

type QueuedRequest = {
  anilistId: number;
  resolve: (value: AniMedia) => void;
  reject: (reason: Error | ExtensionError) => void;
  promise: Promise<AniMedia>;
};

export interface AniRateLimitSnapshot {
  limit?: number;
  remaining?: number;
  resetAt?: number;
  retryAt?: number;
  lastUpdated: number;
}

class RateLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('AniList rate limit exceeded');
    this.name = 'RateLimitError';
  }
}

class RetriableHttpError extends Error {
  constructor(readonly status: number) {
    super(`AniList HTTP ${status}`);
    this.name = 'RetriableHttpError';
  }
}

export class AnilistApiService {
  private readonly log = logger.create('AniListApiService');
  private readonly API_URL = 'https://graphql.anilist.co';
  private readonly BATCH_SIZE = 2;
  private readonly BATCH_DELAY_MS = 1200;
  private readonly MAX_RETRIES = 3;

  private requestQueue: QueuedRequest[] = [];
  private isProcessingQueue = false;
  private queueBackoffUntil = 0;
  private inflight = new Map<number, Promise<AniMedia>>();
  private queueState: { rateLimit: AniRateLimitSnapshot | null } = { rateLimit: null };

  private readonly findMediaWithRelationsQuery = `
    query FindRoot($id: Int) {
      Media(id: $id) {
        id
        format
        title { romaji english native }
        startDate { year }
        synonyms
        relations {
          edges {
            relationType
            node {
              id
              relations {
                edges {
                  relationType
                  node {
                    id
                    relations {
                      edges {
                        relationType
                        node { id }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  public fetchMediaWithRelations(anilistId: number): Promise<AniMedia> {
    if (this.log) {
      this.log.debug(`enqueue anilist fetch ${anilistId}`);
    }
    if (this.inflight.has(anilistId)) {
      return this.inflight.get(anilistId)!;
    }

    let resolveFn: (value: AniMedia) => void;
    let rejectFn: (reason: Error | ExtensionError) => void;

    const promise = new Promise<AniMedia>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    this.requestQueue.push({ anilistId, resolve: resolveFn!, reject: rejectFn!, promise });
    this.inflight.set(anilistId, promise);
    this.processQueue().catch(error => {
      logError(normalizeError(error), 'AnilistApiService:processQueue');
    });

    return promise;
  }

  public getQueueState(): Readonly<{ rateLimit: AniRateLimitSnapshot | null }> {
    return this.queueState;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    let processedInWindow = 0;

    try {
      while (this.requestQueue.length > 0) {
      this.log.debug(`processing AniList queue size=${this.requestQueue.length}`);
        const now = Date.now();
        if (now < this.queueBackoffUntil) {
          await this.delay(this.queueBackoffUntil - now);
          processedInWindow = 0;
        }

        const request = this.requestQueue.shift()!;
        this.log.debug(`issuing AniList request id=${request.anilistId}`);
        const outcome = await this.handleRequest(request);

        if (outcome === 'rate-limited') {
          processedInWindow = 0;
          continue;
        }

        processedInWindow += 1;
        if (processedInWindow >= this.BATCH_SIZE && this.requestQueue.length > 0) {
          processedInWindow = 0;
          await this.delay(this.BATCH_DELAY_MS);
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async handleRequest(request: QueuedRequest): Promise<'completed' | 'rate-limited'> {
    try {
      const media = await this.fetchFromApi(request.anilistId);
      request.resolve(media);
      this.clearInflight(request.anilistId, request.promise);
      return 'completed';
    } catch (error) {
      if (error instanceof RateLimitError) {
        this.queueBackoffUntil = Math.max(this.queueBackoffUntil, Date.now() + error.retryAfterMs);
        this.requestQueue.unshift(request);
        return 'rate-limited';
      }

      const normalized = normalizeError(error);
      request.reject(normalized);
      this.clearInflight(request.anilistId, request.promise);
      return 'completed';
    }
  }

  private clearInflight(anilistId: number, promise: Promise<AniMedia>): void {
    const current = this.inflight.get(anilistId);
    if (current === promise) {
      this.inflight.delete(anilistId);
    }
  }

  private async fetchFromApi(anilistId: number): Promise<AniMedia> {
    let attempt = 0;
    let delayMs = 1000;

    while (true) {
      try {
        const response = await fetch(this.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query: this.findMediaWithRelationsQuery, variables: { id: anilistId } }),
        });

        const headerSnapshot = this.parseRateLimitHeaders(response.headers);

        if (response.status === 429) {
          const retryAfterMs = this.parseRetryAfter(response.headers.get('Retry-After'));
          this.applyRateLimitSnapshot({
            ...(headerSnapshot ?? {}),
            retryAt: Date.now() + retryAfterMs,
            lastUpdated: Date.now(),
          });
          throw new RateLimitError(retryAfterMs);
        }

        if (!response.ok) {
          if (response.status >= 500 && response.status < 600) {
            throw new RetriableHttpError(response.status);
          }

          const message = `AniList API Error: ${response.status}`;
          throw createError(
            ErrorCode.API_ERROR,
            message,
            'AniList request failed.',
            { status: response.status },
          );
        }

        if (headerSnapshot) {
          this.applyRateLimitSnapshot({ ...headerSnapshot, lastUpdated: Date.now() });
        }

        const result = (await response.json()) as FindMediaResponse;
        const media = result?.data?.Media;

        if (!media) {
          if (result?.errors?.length) {
            const message = result.errors.map(e => e.message).join(', ');
            throw createError(ErrorCode.API_ERROR, `AniList GraphQL Error: ${message}`, 'AniList request failed.');
          }
          throw createError(ErrorCode.API_ERROR, `AniList response missing media for ${anilistId}`, 'AniList returned an unexpected response.');
        }

        return media;
      } catch (error) {
        if (error instanceof RateLimitError) {
          throw error;
        }

        if (error instanceof RetriableHttpError) {
          attempt += 1;
          if (attempt >= this.MAX_RETRIES) {
            throw createError(
              ErrorCode.API_ERROR,
              `AniList API Error: ${error.status}`,
              'AniList service is temporarily unavailable.',
              { status: error.status },
            );
          }
          await this.delay(delayMs + Math.random() * 150);
          delayMs = Math.min(delayMs * 2, 5000);
          continue;
        }

        throw error;
      }
    }
  }

  private parseRetryAfter(header: string | null): number {
    if (!header) return 2000 + Math.random() * 500;

    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }

    const dateMs = Date.parse(header);
    if (!Number.isNaN(dateMs)) {
      return Math.max(1000, dateMs - Date.now());
    }

    return 2000 + Math.random() * 500;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private parseRateLimitHeaders(headers: Headers): Omit<AniRateLimitSnapshot, 'lastUpdated'> | null {
    const limitHeader = headers.get('X-RateLimit-Limit');
    const remainingHeader = headers.get('X-RateLimit-Remaining');
    const resetHeader = headers.get('X-RateLimit-Reset');

    const snapshot: Omit<AniRateLimitSnapshot, 'lastUpdated'> = {};

    if (limitHeader) {
      const limit = Number(limitHeader);
      if (Number.isFinite(limit)) {
        snapshot.limit = limit;
      }
    }

    if (remainingHeader) {
      const remaining = Number(remainingHeader);
      if (Number.isFinite(remaining)) {
        snapshot.remaining = remaining;
      }
    }

    if (resetHeader) {
      const resetNumeric = Number(resetHeader);
      if (Number.isFinite(resetNumeric)) {
        snapshot.resetAt = resetNumeric < 1_000_000_000_000 ? resetNumeric * 1000 : resetNumeric;
      } else {
        const parsed = Date.parse(resetHeader);
        if (!Number.isNaN(parsed)) {
          snapshot.resetAt = parsed;
        }
      }
    }

    return Object.keys(snapshot).length > 0 ? snapshot : null;
  }

  private applyRateLimitSnapshot(snapshot: AniRateLimitSnapshot): void {
    const now = Date.now();
    const merged: AniRateLimitSnapshot = {
      ...snapshot,
      lastUpdated: snapshot.lastUpdated ?? now,
    };

    this.queueState.rateLimit = merged;

    if (typeof merged.retryAt === 'number' && Number.isFinite(merged.retryAt)) {
      this.queueBackoffUntil = Math.max(this.queueBackoffUntil, merged.retryAt);
    }

    if (typeof merged.remaining === 'number' && merged.remaining <= 0 && typeof merged.resetAt === 'number') {
      this.queueBackoffUntil = Math.max(this.queueBackoffUntil, merged.resetAt);
    }

    if (this.log) {
      this.log.debug(
        `AniList rate-limit update limit=${merged.limit ?? 'n/a'} remaining=${merged.remaining ?? 'n/a'} resetAt=${
          merged.resetAt ?? 'n/a'
        } backoffUntil=${this.queueBackoffUntil}`,
      );
    }
  }
}

