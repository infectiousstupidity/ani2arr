// src/api/anilist.api.ts
import PQueue from 'p-queue';
import PRetry, { AbortError } from 'p-retry';
import type { TtlCache } from '@/cache';
import { createError, ErrorCode } from '@/utils/error-handling';
import { logger } from '@/utils/logger';
import type { AniMedia } from '@/types';

const API_URL = 'https://graphql.anilist.co';
const QUEUE_CONCURRENCY = 1;
const QUEUE_INTERVAL_MS = 60_000;
const QUEUE_INTERVAL_CAP = 45;
const MEDIA_SOFT_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days
const MEDIA_HARD_TTL = 60 * 24 * 60 * 60 * 1000; // 60 days
const DEFAULT_PREQUEL_DEPTH = 5;
const DEFAULT_RATE_LIMIT_DELAY_MS = 5_000;

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

type ExtensionErrorLike = ReturnType<typeof createError>;

export class AnilistApiService {
  private readonly log = logger.create('AniListApiService');
  private readonly queue = new PQueue({
    concurrency: QUEUE_CONCURRENCY,
    interval: QUEUE_INTERVAL_MS,
    intervalCap: QUEUE_INTERVAL_CAP,
  });
  private readonly inflight = new Map<number, Promise<AniMedia>>();
  private readonly caches: { media: TtlCache<AniMedia> } | undefined;
  private pausedUntil: number = 0;

  constructor(caches?: { media: TtlCache<AniMedia> }) {
    this.caches = caches;
  }

  public fetchMediaWithRelations(anilistId: number): Promise<AniMedia> {
    const cache = this.caches?.media;
    if (cache) {
      return (async () => {
        const hit = await cache.read(String(anilistId));
        if (hit) {
          if (hit.stale) {
            void this.enqueueAndCache(anilistId).catch(error => {
              this.log.warn(`background refresh failed for AniList ID ${anilistId}`, error);
            });
          }
          return hit.value;
        }
        return this.enqueueAndCache(anilistId);
      })();
    }

    return this.enqueueAndCache(anilistId);
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

  public async removeMediaFromCache(anilistId: number): Promise<void> {
    const cache = this.caches?.media;
    if (!cache) return;
    try {
      await cache.remove(String(anilistId));
    } catch {
      // best-effort eviction; ignore failures
    }
  }

  private async enqueueAndCache(anilistId: number): Promise<AniMedia> {
    const existing = this.inflight.get(anilistId);
    if (existing) return existing;

    const now = Date.now();
    if (this.pausedUntil > now) {
      await new Promise(resolve => setTimeout(resolve, this.pausedUntil - now));
    }

    const queuePromise = this.queue.add(() => this.executeFetch(anilistId)) as Promise<AniMedia>;
    const promise = queuePromise
      .then(async media => {
        const cache = this.caches?.media;
        if (cache) {
          await cache.write(String(anilistId), media, {
            staleMs: MEDIA_SOFT_TTL,
            hardMs: MEDIA_HARD_TTL,
            meta: { cachedAt: Date.now() },
          });
        }
        return media;
      })
      .finally(() => {
        this.inflight.delete(anilistId);
      });

    this.inflight.set(anilistId, promise);
    return promise;
  }

  private async executeFetch(anilistId: number): Promise<AniMedia> {
    try {
      return await PRetry(
        async () => {
          const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ query: FIND_MEDIA_QUERY, variables: { id: anilistId } }),
          });

          if (!response.ok) {
            if (response.status === 429) {
              const retryAfter = this.parseRetryAfterTs(response.headers.get('Retry-After'));
              const delay = retryAfter ? Math.max(0, retryAfter - Date.now()) : DEFAULT_RATE_LIMIT_DELAY_MS;
              this.pausedUntil = Date.now() + delay;
              this.log.warn(`AniList rate limit hit. Pausing ALL requests for ${delay}ms.`);
              const error = new Error('Rate limit exceeded');
              (error as { retryAfterMs?: number }).retryAfterMs = delay;
              throw error;
            }

            if (response.status >= 400 && response.status < 500) {
              const extensionError = createError(
                ErrorCode.API_ERROR,
                `AniList API Error: ${response.status}`,
                'AniList request failed.',
                { status: response.status },
              );
              const nonRetryable = Object.assign(new Error(extensionError.message), { extensionError });
              throw new AbortError(nonRetryable);
            }

            const retriable = new Error(`AniList API Error: ${response.status}`);
            (retriable as { status?: number }).status = response.status;
            throw retriable;
          }

          const payload = (await response.json()) as FindMediaResponse;
          const media = payload?.data?.Media;

          if (!media) {
            if (payload?.errors?.length) {
              const message = payload.errors.map(err => err.message).join(', ');
              const extensionError = createError(
                ErrorCode.API_ERROR,
                `AniList GraphQL Error: ${message}`,
                'AniList request failed.',
              );
              const nonRetryable = Object.assign(new Error(extensionError.message), { extensionError });
              throw new AbortError(nonRetryable);
            }

            const extensionError = createError(
              ErrorCode.API_ERROR,
              `AniList response missing media for ${anilistId}`,
              'AniList returned an unexpected response.',
            );
            const nonRetryable = Object.assign(new Error(extensionError.message), { extensionError });
            throw new AbortError(nonRetryable);
          }

          return media;
        },
        {
          retries: 3,
          minTimeout: 0,
          maxTimeout: 0,
          onFailedAttempt: async ({ error: attemptError, attemptNumber }) => {
            const retryAfterMs = (attemptError as Error & { retryAfterMs?: number }).retryAfterMs;
            const exponentialDelay = Math.min(1_000 * 2 ** (attemptNumber - 1), 5_000);
            const waitMs =
              retryAfterMs && retryAfterMs > 0 ? Math.max(retryAfterMs, exponentialDelay) : exponentialDelay;
            if (waitMs > 0) {
              await new Promise(resolve => setTimeout(resolve, waitMs));
            }
          },
        },
      );
    } catch (error) {
      if (error instanceof AbortError) {
        const original = error.originalError as Error & { extensionError?: ExtensionErrorLike };
        if (original?.extensionError) {
          throw original.extensionError;
        }
        throw createError(ErrorCode.API_ERROR, original?.message ?? error.message, 'AniList request failed.');
      }

      if (error instanceof Error) {
        const withExtension = error as Error & { extensionError?: ExtensionErrorLike };
        if (withExtension.extensionError) {
          throw withExtension.extensionError;
        }
      }

     if (error instanceof Error) {
        const { status } = error as Error & { status?: unknown };
        if (typeof status === 'number') {
          throw createError(
            ErrorCode.API_ERROR,
            `AniList API Error: ${status}`,
            'AniList service is temporarily unavailable.',
            { status },
          );
        }
      }

      throw error;
    }
  }

  private extractPrequelId(media: AniMedia): number | null {
    const edges = media.relations?.edges ?? [];
    const prequelEdge = edges.find(edge => edge?.relationType === 'PREQUEL');
    if (!prequelEdge) return null;
    const id = prequelEdge.node?.id;
    return typeof id === 'number' && Number.isFinite(id) ? id : null;
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
}
