// src/api/anilist.api.ts
import PQueue from 'p-queue';
import { withRetry, AbortError } from '@/utils/retry';
import type { TtlCache } from '@/cache';
import { createError, ErrorCode } from '@/utils/error-handling';
import { logger } from '@/utils/logger';
import type { AniMedia, RequestPriority } from '@/types';
import { priorityValue } from '@/utils/priority';

const API_URL = 'https://graphql.anilist.co';
const QUEUE_CONCURRENCY = 1;
const MEDIA_SOFT_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days
const MEDIA_HARD_TTL = 60 * 24 * 60 * 60 * 1000; // 60 days
const DEFAULT_PREQUEL_DEPTH = 5;
const DEFAULT_RATE_LIMIT_DELAY_MS = 5_000;

// Single media fetch query
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

// Batch query for up to 50 IDs at once
const FIND_MEDIA_BATCH_QUERY = `
  query FindMediaBatch($ids: [Int!]) {
    Page(perPage: 50) {
      media(id_in: $ids, type: ANIME) {
        id
        format
        title { romaji english native }
        startDate { year }
        synonyms
        relations {
          edges {
            relationType
            node { id }
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

type FindMediaBatchResponse = {
  data?: { Page?: { media?: AniMedia[] } };
  errors?: { message: string; status: number }[];
};

type ExtensionErrorLike = ReturnType<typeof createError>;

export class AnilistApiService {
  private readonly log = logger.create('AniListApiService');
  private readonly queue = new PQueue({
    // Keep a single global lane for AniList to ensure ordering
    // and allow high-priority tasks to jump ahead of background batches.
    // Rate limiting is enforced via 429 handling (pausedUntil),
    // which applies uniformly to all queued tasks.
    concurrency: QUEUE_CONCURRENCY,
  });
  private readonly inflight = new Map<number, { promise: Promise<AniMedia>; kind: 'single' | 'batch'; token?: number }>();
  private readonly caches: { media: TtlCache<AniMedia> } | undefined;
  private pausedUntil: number = 0;
  private readonly tokens = new Map<number, number>();
  private readonly batchRunningIds = new Set<number>();

  constructor(caches?: { media: TtlCache<AniMedia> }) {
    this.caches = caches;
  }

  private createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject } as const;
  }

  // Bump and read token helpers for per-ID preemption
  private bumpToken(id: number): number {
    const next = (this.tokens.get(id) ?? 0) + 1;
    this.tokens.set(id, next);
    return next;
  }
  private currentToken(id: number): number {
    return this.tokens.get(id) ?? 0;
  }

  // Future-ready public API to allow priority bumps outside detail pages
  public prioritize(ids: number | number[], options?: { schedule?: boolean }): void {
    const list = Array.isArray(ids) ? ids : [ids];
    const schedule = options?.schedule === true;
    for (const id of list) {
      const prev = this.currentToken(id);
      const next = this.bumpToken(id);
      if (import.meta.env.DEV) {
        this.log.debug?.(`prio:bump id=${id} token_old=${prev} token_new=${next} schedule=${String(schedule)}`);
      }
      if (schedule) {
        void this.enqueueAndCache(id, { priority: 'high' }).catch(() => {});
      }
    }
  }

  // Fetch single media by ID with caching
  public fetchMediaWithRelations(
    anilistId: number,
    options?: { priority?: RequestPriority },
  ): Promise<AniMedia> {
    const cache = this.caches?.media;
    if (cache) {
      return (async () => {
        const hit = await cache.read(String(anilistId));
        if (hit) {
          if (import.meta.env.DEV) {
            this.log.debug?.(
              `cache:media id=${anilistId} hit stale=${String(hit.stale)} staleAt=${hit.staleAt} expiresAt=${hit.expiresAt}`,
            );
          }
          if (hit.stale) {
            void this.enqueueAndCache(anilistId, options).catch(error => {
              this.log.warn(`background refresh failed for AniList ID ${anilistId}`, error);
            });
          }
          return hit.value;
        }
        return this.enqueueAndCache(anilistId, options);
      })();
    }

    return this.enqueueAndCache(anilistId, options);
  }

  // Iterate prequel chain from seed media
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

  // Remove media from cache (best-effort)
  public async removeMediaFromCache(anilistId: number): Promise<void> {
    const cache = this.caches?.media;
    if (!cache) return;
    try {
      await cache.remove(String(anilistId));
    } catch {
      // best-effort eviction; ignore failures
    }
  }

  // Fetch multiple media by IDs with batching and caching
  public async fetchMediaBatch(ids: number[]): Promise<Map<number, AniMedia>> {
    const uniqueIds = Array.from(new Set(ids.filter(id => typeof id === 'number' && Number.isFinite(id)))) as number[];
    const results = new Map<number, AniMedia>();
    if (uniqueIds.length === 0) return results;

    const cache = this.caches?.media;
    const freshMisses: number[] = [];

    if (cache) {
      // Read cache and short-circuit fresh hits; schedule refresh for stale.
      for (const id of uniqueIds) {
        const hit = await cache.read(String(id));
        if (hit) {
          results.set(id, hit.value);
          if (hit.stale) {
            // Background refresh; don't await.
            void this.enqueueAndCache(id).catch(() => {});
          }
          continue;
        }
        freshMisses.push(id);
      }
    } else {
      freshMisses.push(...uniqueIds);
    }

    if (freshMisses.length === 0) return results;

    // Exclude IDs that already have an inflight single/batch fetch
    const pendingIds = freshMisses.filter(id => !this.inflight.has(id));

    // Chunk into groups of 50 per GraphQL call.
    const chunks: number[][] = [];
    for (let i = 0; i < pendingIds.length; i += 50) {
      chunks.push(pendingIds.slice(i, i + 50));
    }

    for (const chunk of chunks) {
      if (chunk.length === 0) continue;

      // Create per-ID deferreds and seed inflight dedupe before scheduling
      const deferredById = new Map<number, { promise: Promise<AniMedia>; resolve: (v: AniMedia) => void; reject: (r?: unknown) => void }>();
      const scheduledTokenById = new Map<number, number>();
      for (const id of chunk) {
        const d = this.createDeferred<AniMedia>();
        deferredById.set(id, d);
        const token = this.currentToken(id);
        scheduledTokenById.set(id, token);
        this.inflight.set(id, { promise: d.promise, kind: 'batch', token });
      }

      const now = Date.now();
      if (this.pausedUntil > now) {
        // Honor rate-limit pause before queuing next chunk.
        await new Promise(resolve => setTimeout(resolve, this.pausedUntil - now));
      }

      // Queue the batch as a single task respecting interval caps.
      try {
        const prio = priorityValue('low');
        if (import.meta.env.DEV) {
          this.log.debug?.(
            `queue:add batch size=${chunk.length} prio=${prio} size=${this.queue.size} pending=${this.queue.pending} ids=[${chunk.join(',')}]`,
          );
        }
        const handled = new Set<number>();
        const medias = await this.queue.add(
          async () => {
            if (import.meta.env.DEV) {
              this.log.debug?.(`queue:start batch size=${chunk.length} prio=${prio}`);
            }

            // JIT filter: drop IDs preempted or no longer batch; resolve cached
            const finalIds: number[] = [];
            const dropped: Array<{ id: number; reason: 'preempted' | 'not-batch' | 'cached' }> = [];

            for (const id of chunk) {
              const scheduledToken = scheduledTokenById.get(id) ?? 0;
              const nowToken = this.currentToken(id);
              const d = deferredById.get(id);
              const infl = this.inflight.get(id);

              if (nowToken !== scheduledToken) {
                // Preempted by newer focus bump
                dropped.push({ id, reason: 'preempted' });
                if (d) d.reject(createError(ErrorCode.API_ERROR, `AniList request preempted for ${id}`, 'Request superseded.', { preempted: true }));
                handled.add(id);
                continue;
              }

              if (!infl || infl.kind !== 'batch' || infl.promise !== d?.promise) {
                // No longer a matching batch inflight (likely promoted to single)
                dropped.push({ id, reason: 'not-batch' });
                if (d) d.reject(createError(ErrorCode.API_ERROR, `AniList request preempted for ${id}`, 'Request superseded.', { preempted: true }));
                handled.add(id);
                continue;
              }

              // Check cache again; if fresh now, resolve from cache and drop from batch
              const cache = this.caches?.media;
              if (cache) {
                try {
                  const hit = await cache.read(String(id));
                  if (hit && !hit.stale) {
                    results.set(id, hit.value);
                    if (d) d.resolve(hit.value);
                    // Only clear inflight if it still points to this batch's deferred
                    const cur = this.inflight.get(id);
                    if (cur && cur.kind === 'batch' && cur.promise === d?.promise) {
                      this.inflight.delete(id);
                    }
                    dropped.push({ id, reason: 'cached' });
                    handled.add(id);
                    continue;
                  }
                } catch {
                  // ignore cache read failures; fall through to include in batch
                }
              }

              finalIds.push(id);
            }

            if (import.meta.env.DEV) {
              const kept = finalIds.length;
              const droppedCount = dropped.length;
              const reasons = dropped.reduce<Record<string, number>>((acc, x) => {
                acc[x.reason] = (acc[x.reason] ?? 0) + 1;
                return acc;
              }, {});
              this.log.debug?.(`batch:filter size_in=${chunk.length} kept=${kept} dropped=${droppedCount} reasons=${JSON.stringify(reasons)}`);
              if (droppedCount > 0) {
                for (const d of dropped) {
                  this.log.debug?.(`batch:drop id=${d.id} reason=${d.reason}`);
                }
              }
            }

            if (finalIds.length === 0) {
              if (import.meta.env.DEV) {
                for (const d of dropped) {
                  this.log.debug?.(`batch:drop id=${d.id} reason=${d.reason}`);
                }
              }
              return [] as AniMedia[];
            }

            // Mark these IDs as running under a batch before the HTTP call
            for (const id of finalIds) this.batchRunningIds.add(id);
            try {
              return await this.executeBatch(finalIds);
            } finally {
              for (const id of finalIds) this.batchRunningIds.delete(id);
            }
          },
          { priority: prio },
        ) as AniMedia[];

        for (const media of medias) {
          if (!media || typeof media.id !== 'number') continue;
          results.set(media.id, media);
          // Write to cache per item.
          await this.caches?.media?.write(String(media.id), media, {
            staleMs: MEDIA_SOFT_TTL,
            hardMs: MEDIA_HARD_TTL,
            meta: { cachedAt: Date.now() },
          });
          const d = deferredById.get(media.id);
          if (d) {
            d.resolve(media);
          }
          // Only clear inflight if it still corresponds to this batch task
          const cur = this.inflight.get(media.id);
          if (cur && cur.kind === 'batch' && cur.promise === d?.promise) {
            this.inflight.delete(media.id);
          }
          if (import.meta.env.DEV) {
            const t = (media?.title ?? {}) as Record<string, string>;
            const name = (t.romaji || t.english || t.native || '').toString().trim();
            this.log.debug?.(`queue:done batch-item id=${media.id}${name ? ` name="${name}"` : ''}`);
          }
        }

        // For IDs not returned, reject deduped promises and clear inflight.
        for (const id of chunk) {
          if (!results.has(id) && !handled.has(id)) {
            const d = deferredById.get(id);
            if (d) {
              d.reject(
                createError(
                  ErrorCode.API_ERROR,
                  `AniList response missing media for ${id}`,
                  'AniList returned an unexpected response.',
                ),
              );
            }
            // Only clear inflight if it still corresponds to this batch task
            const cur = this.inflight.get(id);
            if (cur && cur.kind === 'batch' && cur.promise === d?.promise) {
              this.inflight.delete(id);
            }
          }
        }
      } catch (error) {
        // Propagate failures to waiting singles and clear inflight entries
        for (const id of chunk) {
          const d = deferredById.get(id);
          if (d) {
            d.reject(error);
          }
          // Only clear inflight if it still corresponds to this batch task
          const cur = this.inflight.get(id);
          if (cur && cur.kind === 'batch' && cur.promise === d?.promise) {
            this.inflight.delete(id);
          }
        }
        throw error;
      }
    }

    return results;
  }

  // Fetch single media with inflight deduplication and caching
  private async enqueueAndCache(
    anilistId: number,
    options?: { priority?: RequestPriority },
  ): Promise<AniMedia> {
    const existing = this.inflight.get(anilistId);
    if (existing) {
      const wantsHigh = options?.priority === 'high';
      if (existing.kind === 'batch' && wantsHigh) {
        if (this.batchRunningIds.has(anilistId)) {
          // Batch already running for this id; reuse to avoid duplicate HTTP
          if (import.meta.env.DEV) {
            this.log.debug?.(`queue:reuse-running-batch id=${anilistId}`);
          }
          return existing.promise;
        } else {
          const oldToken = this.currentToken(anilistId);
          const newToken = this.bumpToken(anilistId);
          if (import.meta.env.DEV) {
          this.log.debug?.(
            `queue:preempt id=${anilistId} from=batch to=single prio=${priorityValue('high')} token_old=${oldToken} token_new=${newToken}`,
          );
          }
          // continue to schedule a high-priority single and replace inflight
        }
      } else {
        return existing.promise;
      }
    }

    const now = Date.now();
    if (this.pausedUntil > now) {
      await new Promise(resolve => setTimeout(resolve, this.pausedUntil - now));
    }

    const wantsHigh = options?.priority === 'high';
    const scheduledToken = wantsHigh ? this.bumpToken(anilistId) : this.currentToken(anilistId);
    const prio = priorityValue(options?.priority);
    if (import.meta.env.DEV) {
      this.log.debug?.(
        `queue:add single id=${anilistId} prio=${prio} size=${this.queue.size} pending=${this.queue.pending}`,
      );
    }
    const queuePromise = this.queue.add(
      () => {
        if (import.meta.env.DEV) {
          this.log.debug?.(`queue:start single id=${anilistId} prio=${prio}`);
        }
        return this.executeFetch(anilistId);
      },
      { priority: prio },
    ) as Promise<AniMedia>;
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
        if (import.meta.env.DEV) {
          const t = (media?.title ?? {}) as Record<string, string>;
          const name = (t.romaji || t.english || t.native || '').toString().trim();
          this.log.debug?.(`queue:done single id=${anilistId}${name ? ` name="${name}"` : ''}`);
        }
        return media;
      })
      .finally(() => {
        this.inflight.delete(anilistId);
      });

    this.inflight.set(anilistId, { promise, kind: 'single', token: scheduledToken });
    return promise;
  }

  // Execute the actual fetch with retries and error handling
  private async executeFetch(anilistId: number): Promise<AniMedia> {
    try {
      return await withRetry(
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
          extractRetryAfterMs: (e: unknown) => (e as { retryAfterMs?: number })?.retryAfterMs,
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

  // Execute batch fetch with retries and error handling
  private async executeBatch(ids: number[]): Promise<AniMedia[]> {
    try {
      return await withRetry(
        async () => {
          const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ query: FIND_MEDIA_BATCH_QUERY, variables: { ids } }),
          });

          if (!response.ok) {
            if (response.status === 429) {
              const retryAfter = this.parseRetryAfterTs(response.headers.get('Retry-After'));
              const delay = retryAfter ? Math.max(0, retryAfter - Date.now()) : DEFAULT_RATE_LIMIT_DELAY_MS;
              this.pausedUntil = Date.now() + delay;
              this.log.warn(`AniList rate limit hit (batch x${ids.length}). Pausing for ${delay}ms.`);
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

          const payload = (await response.json()) as FindMediaBatchResponse;
          const media = payload?.data?.Page?.media ?? [];
          return media.filter((m): m is AniMedia => Boolean(m && typeof m.id === 'number'));
        },
        {
          retries: 3,
          minTimeout: 0,
          maxTimeout: 0,
          extractRetryAfterMs: (e: unknown) => (e as { retryAfterMs?: number })?.retryAfterMs,
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

  // Extract prequel ID from media relations
  private extractPrequelId(media: AniMedia): number | null {
    const edges = media.relations?.edges ?? [];
    const prequelEdge = edges.find(edge => edge?.relationType === 'PREQUEL');
    if (!prequelEdge) return null;
    const id = prequelEdge.node?.id;
    return typeof id === 'number' && Number.isFinite(id) ? id : null;
  }

  // Parse Retry-After header to timestamp
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
