import PQueue from 'p-queue';
import type { TtlCache } from '@/cache';

import { createError, ErrorCode } from '@/utils/error-handling';
import { logger } from '@/utils/logger';
import type { AniMedia } from '@/types';

const API_URL = 'https://graphql.anilist.co';

const RATE_LIMIT_SAFETY_BUFFER_MS = 1_500;
const DEFAULT_BACKOFF_MS = 2_000;
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 5_000;
const MAX_RETRIES = 3;

const API_DEFAULT_MINUTE_LIMIT = 90;
const DEGRADED_MINUTE_LIMIT = 30;
const REQUEST_LOG_WINDOW_MS = 60_000;
const BURST_WINDOW_MS = 5_000;
const BURST_CAP = 10;
const MIN_WAIT_DELAY_MS = 25;

const QUEUE_CONCURRENCY = 1;
const QUEUE_INTERVAL_CAP = DEGRADED_MINUTE_LIMIT;
const QUEUE_INTERVAL_MS = 60_000;

const DEFAULT_PREQUEL_DEPTH = 5;

const FIND_MEDIA_QUERY = `
  query FindMedia($id: Int) {
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
          }
        }
      }
    }
  }
`;

type FindMediaResponse = {
  data?: { Media?: AniMedia };
  errors?: { message: string; status: number }[];
};

export interface AniRateLimitSnapshot {
  limit?: number;
  remaining?: number;
  resetAt?: number;
  backoffUntil?: number;
  lastUpdated: number;
}

class RetriableHttpError extends Error {
  constructor(readonly status: number) {
    super(`AniList HTTP ${status}`);
    this.name = 'RetriableHttpError';
  }
}

type RateLimitHeaders = Omit<AniRateLimitSnapshot, 'lastUpdated'> & { lastUpdated?: number };

export class AnilistApiService {
  private readonly log = logger.create('AniListApiService');
  private readonly queue = new PQueue({
    concurrency: QUEUE_CONCURRENCY,
    intervalCap: QUEUE_INTERVAL_CAP,
    interval: QUEUE_INTERVAL_MS,
    carryoverConcurrencyCount: true,
  });

  private readonly queueState: { rateLimit: AniRateLimitSnapshot | null } = { rateLimit: null };
  private readonly requestLog: number[] = [];
  private globalBackoffUntil = 0;
  private readonly inflight = new Map<number, Promise<AniMedia>>();
  private readonly caches: { media: TtlCache<AniMedia> } | undefined;

  constructor(caches?: { media: TtlCache<AniMedia> }) {
    this.caches = caches ?? undefined;
  }

  public fetchMediaWithRelations(anilistId: number): Promise<AniMedia> {
    // Persistent cache lookup
    const cache = this.caches?.media;
    if (cache) {
      return (async () => {
        const hit = await cache.read(String(anilistId));
        if (hit) {
          if (hit.stale) {
            // SWR: refresh in background via queue
            void this.enqueueAndCache(anilistId).catch(() => {});
          }
          return hit.value;
        }
        return this.enqueueAndCache(anilistId);
      })();
    }

    // No cache configured: just queue the fetch
    this.log.debug(`queue anilist fetch ${anilistId}`);
    return this.queue.add(() => this.executeFetch(anilistId)) as Promise<AniMedia>;
  }

  private enqueueAndCache(anilistId: number): Promise<AniMedia> {
    const existing = this.inflight.get(anilistId);
    if (existing) return existing;
    const promise = (this.queue.add(() => this.executeFetch(anilistId)) as Promise<AniMedia>)
      .then(async media => {
        const cache = this.caches?.media;
        if (cache) {
          const now = Date.now();
          // 14d soft, 60d hard — Ani metadata and prequel links are slow-moving.
          const MEDIA_SOFT_TTL = 14 * 24 * 60 * 60 * 1000;
          const MEDIA_HARD_TTL = 60 * 24 * 60 * 60 * 1000;
          await cache.write(String(anilistId), media, { staleMs: MEDIA_SOFT_TTL, hardMs: MEDIA_HARD_TTL, meta: { cachedAt: now } });
        }
        return media;
      })
      .finally(() => {
        this.inflight.delete(anilistId);
      });
    this.inflight.set(anilistId, promise);
    return promise;
  }

  public async *iteratePrequelChain(
    seed: AniMedia,
    options: { includeRoot?: boolean; maxDepth?: number } = {},
  ): AsyncGenerator<AniMedia> {
    const includeRoot = options.includeRoot ?? false;
    const maxDepth = options.maxDepth ?? DEFAULT_PREQUEL_DEPTH;

    const visited = new Set<number>();
    let depth = 0;
    let current: AniMedia | null = seed ?? null;

    if (!current) return;

    if (includeRoot && !visited.has(current.id)) {
      visited.add(current.id);
      yield current;
    } else {
      visited.add(current.id);
    }

    while (current && (maxDepth < 0 || depth < maxDepth)) {
      const nextId = this.extractPrequelId(current);
      if (nextId === null || visited.has(nextId)) {
        break;
      }

      const nextMedia = await this.fetchMediaWithRelations(nextId);
      yield nextMedia;
      visited.add(nextId);
      current = nextMedia;
      depth += 1;
    }
  }

  public getQueueState(): Readonly<{ rateLimit: AniRateLimitSnapshot | null }> {
    const snapshot = this.queueState.rateLimit;
    return Object.freeze({ rateLimit: snapshot ? { ...snapshot } : null });
  }

  private async executeFetch(anilistId: number): Promise<AniMedia> {
    let attempt = 0;
    let retryDelay = RETRY_BASE_DELAY_MS;

    while (true) {
      await this.waitForGlobalBackoff();
      await this.reserveRequestSlot();

      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query: FIND_MEDIA_QUERY, variables: { id: anilistId } }),
        });

        const retryAfter = this.parseRetryAfterTs(response.headers.get('Retry-After'));
        const rateLimitHeaders = this.parseRateLimitHeaders(response.headers);

        if (response.status === 429) {
          const fallbackTarget = Date.now() + DEFAULT_BACKOFF_MS + RATE_LIMIT_SAFETY_BUFFER_MS;
          const baseTarget = retryAfter ?? rateLimitHeaders?.resetAt ?? null;
          const backoffTarget = baseTarget ? baseTarget + RATE_LIMIT_SAFETY_BUFFER_MS : fallbackTarget;
          this.globalBackoffUntil = Math.max(this.globalBackoffUntil, backoffTarget);
          this.applyRateLimitSnapshot({
            ...(rateLimitHeaders ?? {}),
            backoffUntil: backoffTarget,
            lastUpdated: Date.now(),
          });
          continue;
        }

        if (!response.ok) {
          if (response.status >= 500 && response.status < 600) {
            throw new RetriableHttpError(response.status);
          }

          throw createError(
            ErrorCode.API_ERROR,
            `AniList API Error: ${response.status}`,
            'AniList request failed.',
            { status: response.status },
          );
        }

        if (rateLimitHeaders) {
          this.applyRateLimitSnapshot({ ...rateLimitHeaders, lastUpdated: Date.now() });
        }

        const payload = (await response.json()) as FindMediaResponse;
        const media = payload?.data?.Media;

        if (!media) {
          if (payload?.errors?.length) {
            const message = payload.errors.map(error => error.message).join(', ');
            throw createError(ErrorCode.API_ERROR, `AniList GraphQL Error: ${message}`, 'AniList request failed.');
          }
          throw createError(
            ErrorCode.API_ERROR,
            `AniList response missing media for ${anilistId}`,
            'AniList returned an unexpected response.',
          );
        }

        return media;
      } catch (error) {
        if (error instanceof RetriableHttpError) {
          attempt += 1;
          if (attempt > MAX_RETRIES) {
            throw createError(
              ErrorCode.API_ERROR,
              `AniList API Error: ${error.status}`,
              'AniList service is temporarily unavailable.',
              { status: error.status },
            );
          }

          await this.delay(retryDelay);
          retryDelay = Math.min(retryDelay * 2, RETRY_MAX_DELAY_MS);
          continue;
        }

        throw error;
      }
    }
  }

  private async reserveRequestSlot(): Promise<void> {
    while (true) {
      const now = Date.now();
      this.purgeRequestLog(now);

      const minuteLimit = this.getEffectiveMinuteLimit();
      if (minuteLimit > 0 && this.requestLog.length >= minuteLimit) {
        const nextWindow = this.requestLog[0]! + REQUEST_LOG_WINDOW_MS + RATE_LIMIT_SAFETY_BUFFER_MS;
        const waitMs = Math.max(nextWindow - now, MIN_WAIT_DELAY_MS);
        await this.delay(waitMs);
        continue;
      }

      const burstThreshold = now - BURST_WINDOW_MS;
      const burstCount = this.countRequestsSince(burstThreshold);
      if (burstCount >= BURST_CAP) {
        const earliestWithinBurst = this.requestLog[this.requestLog.length - burstCount]!;
        const waitUntil = earliestWithinBurst + BURST_WINDOW_MS + RATE_LIMIT_SAFETY_BUFFER_MS;
        const waitMs = Math.max(waitUntil - now, MIN_WAIT_DELAY_MS);
        await this.delay(waitMs);
        continue;
      }

      this.requestLog.push(now);
      break;
    }
  }

  private purgeRequestLog(now: number): void {
    while (this.requestLog.length > 0 && now - this.requestLog[0]! >= REQUEST_LOG_WINDOW_MS) {
      this.requestLog.shift();
    }
  }

  private countRequestsSince(threshold: number): number {
    let count = 0;
    for (let i = this.requestLog.length - 1; i >= 0; i -= 1) {
      const ts = this.requestLog[i]!;
      if (ts >= threshold) {
        count += 1;
      } else {
        break;
      }
    }
    return count;
  }

  private getEffectiveMinuteLimit(): number {
    const headerLimit = this.queueState.rateLimit?.limit;
    const resolvedHeaderLimit =
      typeof headerLimit === 'number' && Number.isFinite(headerLimit) ? headerLimit : API_DEFAULT_MINUTE_LIMIT;
    return Math.min(resolvedHeaderLimit, DEGRADED_MINUTE_LIMIT);
  }

  private async waitForGlobalBackoff(): Promise<void> {
    const waitMs = this.globalBackoffUntil - Date.now();
    if (waitMs > 0) {
      await this.delay(waitMs);
    }
    if (Date.now() >= this.globalBackoffUntil) {
      this.globalBackoffUntil = 0;
    }
  }

  private applyRateLimitSnapshot(snapshot: RateLimitHeaders | null): void {
    if (!snapshot) {
      const existing = this.queueState.rateLimit;
      if (existing) {
        this.queueState.rateLimit = { ...existing, lastUpdated: Date.now() };
      }
      return;
    }

    const now = snapshot.lastUpdated ?? Date.now();
    const resolved: AniRateLimitSnapshot = {
      lastUpdated: now,
    };

    if (typeof snapshot.limit === 'number') resolved.limit = snapshot.limit;
    if (typeof snapshot.remaining === 'number') resolved.remaining = snapshot.remaining;
    if (typeof snapshot.resetAt === 'number') resolved.resetAt = snapshot.resetAt;
    if (typeof snapshot.backoffUntil === 'number') {
      resolved.backoffUntil = snapshot.backoffUntil;
      this.globalBackoffUntil = Math.max(this.globalBackoffUntil, snapshot.backoffUntil);
    }

    this.queueState.rateLimit = resolved;

    const { limit, remaining, resetAt, backoffUntil } = resolved;
    this.log.debug(
      `rate limit updated limit=${limit ?? 'n/a'} remaining=${remaining ?? 'n/a'} resetAt=${resetAt ?? 'n/a'} backoff=${backoffUntil ?? 'n/a'}`,
    );
  }

  private parseRateLimitHeaders(headers: Headers): RateLimitHeaders | null {
    const limitHeader = headers.get('X-RateLimit-Limit');
    const remainingHeader = headers.get('X-RateLimit-Remaining');
    const resetHeader = headers.get('X-RateLimit-Reset');

    const snapshot: RateLimitHeaders = {};

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
      const resetTs = this.parseTimestamp(resetHeader);
      if (resetTs !== null) {
        snapshot.resetAt = resetTs;
      }
    }

    return Object.keys(snapshot).length > 0 ? snapshot : null;
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

  private parseTimestamp(value: string | null): number | null {
    if (!value) return null;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private extractPrequelId(media: AniMedia): number | null {
    const edges = media.relations?.edges ?? [];
    const prequelEdge = edges.find(edge => edge?.relationType === 'PREQUEL');
    if (!prequelEdge) return null;
    const id = prequelEdge.node?.id;
    return typeof id === 'number' && Number.isFinite(id) ? id : null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  // Evict a cached AniList media entry once it is no longer needed.
  public async removeMediaFromCache(anilistId: number): Promise<void> {
    const cache = this.caches?.media;
    if (!cache) return;
    try {
      await cache.remove(String(anilistId));
    } catch {
      // best-effort eviction; ignore failures
    }
  }
}
