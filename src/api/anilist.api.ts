// src/api/anilist.api.ts

import { createError, ErrorCode, logError, normalizeError } from '@/utils/error-handling';
import { logger } from '@/utils/logger';
import type { AniFormat, AniTitles, ExtensionError } from '@/types';

const SAFETY_BUFFER_MS = 1_500;
const RATE_LIMIT_MARGIN = 2;
const DEFAULT_MIN_SPACING_MS = 1_200;
const DEFAULT_BACKOFF_MS = 2_000;

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
  backoffUntil?: number;
  lastUpdated: number;
}

class RateLimitError extends Error {
  constructor(readonly retryAt: number) {
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
  private readonly MAX_RETRIES = 3;
  private requestQueue: QueuedRequest[] = [];
  private isProcessingQueue = false;
  private inflight = new Map<number, Promise<AniMedia>>();
  private queueState: { rateLimit: AniRateLimitSnapshot | null } = { rateLimit: null };
  private lastDispatchAt = Number.NEGATIVE_INFINITY;
  private backoffUntil = 0;
  private minSpacingMs = DEFAULT_MIN_SPACING_MS;

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
    const rateLimit = this.queueState.rateLimit;
    return Object.freeze({ rateLimit: rateLimit ? { ...rateLimit } : null });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      while (this.requestQueue.length > 0) {
        const request = this.requestQueue[0]!;
        let shouldRemove = false;

        try {
          const media = await this.dispatchWithGate(request.anilistId);
          request.resolve(media);
          shouldRemove = true;
        } catch (error) {
          if (error instanceof RateLimitError) {
            this.backoffUntil = Math.max(this.backoffUntil, error.retryAt);
            continue;
          }

          const normalized = normalizeError(error);
          request.reject(normalized);
          shouldRemove = true;
        } finally {
          if (shouldRemove && this.requestQueue[0] === request) {
            this.clearInflight(request.anilistId, request.promise);
            this.requestQueue.shift();
          }
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private clearInflight(anilistId: number, promise: Promise<AniMedia>): void {
    const current = this.inflight.get(anilistId);
    if (current === promise) {
      this.inflight.delete(anilistId);
    }
  }

  private async dispatchWithGate(anilistId: number): Promise<AniMedia> {
    let attempt = 0;
    let delayMs = 1000;

    while (true) {
      try {
        await this.awaitDispatchSlot();
        const response = await fetch(this.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query: this.findMediaWithRelationsQuery, variables: { id: anilistId } }),
        });

        const retryTs = this.parseRetryAfterTs(response.headers.get('Retry-After'));
        const headerSnapshot = this.parseRateLimitHeaders(response.headers);
        if (response.status === 429) {
          const fallbackTarget = Date.now() + DEFAULT_BACKOFF_MS + SAFETY_BUFFER_MS;
          const baseTarget = retryTs ?? headerSnapshot?.resetAt ?? null;
          const backoffTarget = baseTarget ? baseTarget + SAFETY_BUFFER_MS : fallbackTarget;
          this.applyRateLimitSnapshot(
            headerSnapshot
              ? { ...headerSnapshot, backoffUntil: backoffTarget, lastUpdated: Date.now() }
              : { backoffUntil: backoffTarget, lastUpdated: Date.now() },
          );
          throw new RateLimitError(backoffTarget);
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

        this.applyRateLimitSnapshot(
          headerSnapshot ? { ...headerSnapshot, lastUpdated: Date.now() } : null,
        );

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
          await this.delay(delayMs);
          delayMs = Math.min(delayMs * 2, 5000);
          continue;
        }

        throw error;
      }
    }
  }

  private async awaitDispatchSlot(): Promise<void> {
    while (true) {
      const now = Date.now();
      const earliest = Math.max(this.backoffUntil, this.lastDispatchAt + this.minSpacingMs);
      if (now >= earliest) {
        this.lastDispatchAt = Math.max(now, earliest);
        return;
      }
      await this.delay(earliest - now);
    }
  }

  private parseRetryAfterTs(header: string | null): number | null {
    if (!header) return null;
    const numeric = Number(header);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Date.now() + numeric * 1000;
    }
    const parsed = Date.parse(header);
    return Number.isNaN(parsed) ? null : Math.max(Date.now(), parsed);
  }

  private parseResetTs(header: string | null): number | null {
    if (!header) return null;
    const numeric = Number(header);
    if (Number.isFinite(numeric)) {
      return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(header);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private computeMinSpacing(limit?: number): number {
    if (!Number.isFinite(limit as number) || (limit as number) <= 0) {
      return this.minSpacingMs ?? DEFAULT_MIN_SPACING_MS;
    }
    const effective = Math.max(1, Math.round(limit as number) - RATE_LIMIT_MARGIN);
    return Math.ceil(60_000 / effective);
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
      const resetTs = this.parseResetTs(resetHeader);
      if (resetTs !== null) {
        snapshot.resetAt = resetTs;
      }
    }

    return Object.keys(snapshot).length > 0 ? snapshot : null;
  }

  private applyRateLimitSnapshot(snapshot: AniRateLimitSnapshot | null): void {
    const now = Date.now();
    const previous = this.queueState.rateLimit ?? undefined;
    const merged: AniRateLimitSnapshot | undefined = snapshot
      ? { ...snapshot, lastUpdated: snapshot.lastUpdated ?? now }
      : previous
      ? { ...previous, lastUpdated: now }
      : undefined;

    if (!merged) {
      return;
    }

    if (Number.isFinite(merged.limit as number)) {
      this.minSpacingMs = this.computeMinSpacing(merged.limit);
    }

    if (Number.isFinite(merged.backoffUntil as number)) {
      this.backoffUntil = Math.max(this.backoffUntil, merged.backoffUntil!);
    }

    if ((merged.remaining ?? Infinity) <= 0 && Number.isFinite(merged.resetAt as number)) {
      this.backoffUntil = Math.max(this.backoffUntil, merged.resetAt! + SAFETY_BUFFER_MS);
    }

    this.queueState.rateLimit = {
      ...merged,
      backoffUntil: this.backoffUntil || undefined,
    };

    if (this.log) {
      this.log.debug(
        `AniList rate-limit update limit=${merged.limit ?? 'n/a'} remaining=${merged.remaining ?? 'n/a'} resetAt=${
          merged.resetAt ?? 'n/a'
        } backoffUntil=${this.backoffUntil || 'n/a'} minSpacing=${this.minSpacingMs}`,
      );
    }
  }
}

