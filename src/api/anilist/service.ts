import PQueue from 'p-queue';
import type { TtlCache } from '@/cache';
import { createError, ErrorCode } from '@/shared/errors/error-utils';
import { logger } from '@/shared/utils/logger';
import type { AniMedia, AniListSearchResult, RequestPriority } from '@/shared/types';
import { priorityValue } from '@/shared/utils/priority';
import {
  DEFAULT_PREQUEL_DEPTH,
  MAX_BATCH_SIZE,
  QUEUE_CONCURRENCY,
} from './constants';
import { cacheMedia, hasCompleteMediaFields, normalizeMedia, sanitizeMedia } from './media-normalizer';
import { AniListExecutor } from './executor';
import { InflightEntry, PausedQueueRunner } from './paused-queue';

export class AnilistApiService {
  private readonly log = logger.create('AniListApiService');
  private readonly queue = new PQueue({ concurrency: QUEUE_CONCURRENCY });
  private readonly inflight = new Map<number, InflightEntry>();
  private readonly caches: { media: TtlCache<AniMedia> } | undefined;
  private pausedUntil = 0;
  private readonly tokens = new Map<number, number>();
  private readonly batchRunningIds = new Set<number>();
  private readonly executor: AniListExecutor;
  private readonly pausedQueue: PausedQueueRunner;

  constructor(caches?: { media: TtlCache<AniMedia> }) {
    this.caches = caches;
    this.executor = new AniListExecutor({
      setPausedUntil: timestamp => {
        this.pausedUntil = timestamp;
      },
    });
    const mediaCache = this.caches?.media;
    this.pausedQueue = new PausedQueueRunner({
      getPausedUntil: () => this.pausedUntil,
      bumpToken: id => this.bumpToken(id),
      currentToken: id => this.currentToken(id),
      inflight: this.inflight,
      queue: this.queue,
      ...(mediaCache ? { cache: mediaCache } : {}),
      executor: this.executor,
      batchRunningIds: this.batchRunningIds,
      createDeferred: <T>() => this.createDeferred<T>(),
    });
  }

  private createDeferred<TValue>() {
    let resolve!: (value: TValue | PromiseLike<TValue>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<TValue>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  private bumpToken(id: number): number {
    const next = (this.tokens.get(id) ?? 0) + 1;
    this.tokens.set(id, next);
    return next;
  }

  private currentToken(id: number): number {
    return this.tokens.get(id) ?? 0;
  }

  private normalizePriority(priority?: RequestPriority): RequestPriority {
    return priority ?? 'normal';
  }

  private addToQueue<T>(task: () => Promise<T>, priority: number): Promise<T> {
    return this.queue.add(task, { priority });
  }

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

  public fetchMediaWithRelations(
    anilistId: number,
    options?: { priority?: RequestPriority; forceRefresh?: boolean },
  ): Promise<AniMedia> {
    if (options?.forceRefresh) {
      return this.enqueueAndCache(anilistId, options);
    }

    const cache = this.caches?.media;
    if (cache) {
      return (async () => {
        const hit = await cache.read(String(anilistId));
        if (hit) {
          const isComplete = hasCompleteMediaFields(hit.value);
          if (import.meta.env.DEV) {
            this.log.debug?.(
              `cache:media id=${anilistId} hit stale=${String(hit.stale)} staleAt=${hit.staleAt} expiresAt=${hit.expiresAt} complete=${String(isComplete)}`,
            );
          }
          if (isComplete) {
            const normalized = normalizeMedia(hit.value);
            if (hit.stale) {
              void this.enqueueAndCache(anilistId, options).catch(error => {
                this.log.warn(`background refresh failed for AniList ID ${anilistId}`, error);
              });
            }
            return sanitizeMedia(normalized);
          }
          void cache.remove(String(anilistId)).catch(() => {});
        }
        return this.enqueueAndCache(anilistId, options);
      })();
    }

    return this.enqueueAndCache(anilistId, options);
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
      // best-effort eviction
    }
  }

  public async fetchMediaBatch(ids: number[]): Promise<Map<number, AniMedia>> {
    const uniqueIds = Array.from(new Set(ids.filter(id => typeof id === 'number' && Number.isFinite(id)))) as number[];
    const results = new Map<number, AniMedia>();
    if (uniqueIds.length === 0) return results;

    const cache = this.caches?.media;
    const freshMisses: number[] = [];

    if (cache) {
      for (const id of uniqueIds) {
        const hit = await cache.read(String(id));
        if (hit) {
          const isComplete = hasCompleteMediaFields(hit.value);
          if (isComplete) {
            results.set(id, normalizeMedia(hit.value));
            if (hit.stale) {
              void this.enqueueAndCache(id).catch(() => {});
            }
            continue;
          }
          void cache.remove(String(id)).catch(() => {});
        }
        freshMisses.push(id);
      }
    } else {
      freshMisses.push(...uniqueIds);
    }

    if (freshMisses.length === 0) return results;

    const pendingIds = freshMisses.filter(id => !this.inflight.has(id));
    const chunks: number[][] = [];
    for (let i = 0; i < pendingIds.length; i += MAX_BATCH_SIZE) {
      chunks.push(pendingIds.slice(i, i + MAX_BATCH_SIZE));
    }

    for (const chunk of chunks) {
      if (chunk.length === 0) continue;

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
        await new Promise(resolve => setTimeout(resolve, this.pausedUntil - now));
      }

      try {
        const prio = priorityValue('low');
        const handled = new Set<number>();
        const medias = await this.addToQueue(async () => {
          const finalIds: number[] = [];
          const dropped: Array<{ id: number; reason: 'preempted' | 'not-batch' | 'cached' }> = [];

          for (const id of chunk) {
            const scheduledToken = scheduledTokenById.get(id) ?? 0;
            const nowToken = this.currentToken(id);
            const d = deferredById.get(id);
            const infl = this.inflight.get(id);

            if (nowToken !== scheduledToken) {
              dropped.push({ id, reason: 'preempted' });
              if (d) d.reject(createError(ErrorCode.API_ERROR, `AniList request preempted for ${id}`, 'Request superseded.', { preempted: true }));
              handled.add(id);
              continue;
            }

            if (!infl || infl.kind !== 'batch' || infl.promise !== d?.promise) {
              dropped.push({ id, reason: 'not-batch' });
              if (d) d.reject(createError(ErrorCode.API_ERROR, `AniList request preempted for ${id}`, 'Request superseded.', { preempted: true }));
              handled.add(id);
              continue;
            }

            const cache = this.caches?.media;
            if (cache) {
              try {
                const hit = await cache.read(String(id));
                if (hit && !hit.stale) {
                  results.set(id, hit.value);
                  if (d) d.resolve(hit.value);
                  const cur = this.inflight.get(id);
                  if (cur && cur.kind === 'batch' && cur.promise === d?.promise) {
                    this.inflight.delete(id);
                  }
                  dropped.push({ id, reason: 'cached' });
                  handled.add(id);
                  continue;
                }
              } catch {
                // ignore
              }
            }
            finalIds.push(id);
          }

          if (finalIds.length === 0) {
            return [];
          }

          for (const id of finalIds) this.batchRunningIds.add(id);
          try {
            return await this.executor.fetchBatch(finalIds);
          } finally {
            for (const id of finalIds) this.batchRunningIds.delete(id);
          }
        }, prio);

        for (const media of medias) {
          if (!media || typeof media.id !== 'number') continue;
          const cachedMedia = await cacheMedia(this.caches?.media, media.id, media);
          results.set(media.id, cachedMedia);
          const d = deferredById.get(media.id);
          if (d) {
            d.resolve(cachedMedia);
          }
          const cur = this.inflight.get(media.id);
          if (cur && cur.kind === 'batch' && cur.promise === d?.promise) {
            this.inflight.delete(media.id);
          }
        }

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
            const cur = this.inflight.get(id);
            if (cur && cur.kind === 'batch' && cur.promise === d?.promise) {
              this.inflight.delete(id);
            }
          }
        }
      } catch (error) {
        for (const id of chunk) {
          const d = deferredById.get(id);
          if (d) {
            d.reject(error);
          }
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

  private async enqueueAndCache(
    anilistId: number,
    options?: { priority?: RequestPriority },
  ): Promise<AniMedia> {
    const priority = this.normalizePriority(options?.priority);
    const existing = this.inflight.get(anilistId);
    if (existing) {
      const wantsHigh = priority === 'high';
      if (existing.kind === 'batch' && wantsHigh) {
        if (this.batchRunningIds.has(anilistId)) {
          return existing.promise;
        }
      } else {
        return existing.promise;
      }
    }

    const now = Date.now();
    if (this.pausedUntil > now) {
      return this.pausedQueue.enqueueWhilePaused(anilistId, priority);
    }

    const wantsHigh = priority === 'high';
    const scheduledToken = wantsHigh ? this.bumpToken(anilistId) : this.currentToken(anilistId);
    const prio = priorityValue(priority);

    const queuePromise = this.addToQueue(() => this.executor.fetchMedia(anilistId), prio);

    const promise = queuePromise
      .then(async media => cacheMedia(this.caches?.media, anilistId, media))
      .finally(() => {
        this.inflight.delete(anilistId);
      });

    this.inflight.set(anilistId, { promise, kind: 'single', token: scheduledToken });
    return promise;
  }

  public async searchMedia(search: string, options?: { limit?: number }): Promise<AniListSearchResult[]> {
    const term = search.trim();
    if (!term) return [];
    const limit = Math.min(Math.max(options?.limit ?? 8, 1), 25);

    const run = async (): Promise<AniListSearchResult[]> => {
      const now = Date.now();
      if (this.pausedUntil > now) {
        await new Promise(resolve => setTimeout(resolve, this.pausedUntil - now));
      }
      return this.executor.search(term, limit);
    };

    return this.addToQueue(run, priorityValue('normal'));
  }

  private extractPrequelId(media: AniMedia): number | null {
    const edges = media.relations?.edges ?? [];
    const prequelEdge = edges.find(edge => edge?.relationType === 'PREQUEL');
    if (!prequelEdge) return null;
    const id = prequelEdge.node?.id;
    return typeof id === 'number' && Number.isFinite(id) ? id : null;
  }
}
