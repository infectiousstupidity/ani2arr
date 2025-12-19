import PQueue from 'p-queue';
import type { TtlCache } from '@/cache';
import { createError, ErrorCode } from '@/shared/errors/error-utils';
import { priorityValue } from '@/shared/utils/priority';
import type { AniMedia, RequestPriority } from '@/shared/types';
import { cacheMedia } from './media-normalizer';
import type { AniListExecutor } from './executor';
import { MAX_BATCH_SIZE } from './constants';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

export type InflightEntry = { promise: Promise<AniMedia>; kind: 'single' | 'batch'; token?: number };

type PausedQueueDeps = {
  getPausedUntil: () => number;
  bumpToken: (id: number) => number;
  currentToken: (id: number) => number;
  inflight: Map<number, InflightEntry>;
  queue: PQueue;
  cache?: TtlCache<AniMedia>;
  executor: AniListExecutor;
  batchRunningIds: Set<number>;
  createDeferred: <T>() => Deferred<T>;
};

export class PausedQueueRunner {
  private readonly pausedByPriority = new Map<RequestPriority, Map<number, { deferred: Deferred<AniMedia>; token: number }>>();
  private pausedFlushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: PausedQueueDeps) {}

  public enqueueWhilePaused(anilistId: number, priority: RequestPriority): Promise<AniMedia> {
    const bucket = this.getPausedBucket(priority);
    const existing = bucket.get(anilistId);
    if (existing) return existing.deferred.promise;

    const deferred = this.deps.createDeferred<AniMedia>();
    const token = priority === 'high' ? this.deps.bumpToken(anilistId) : this.deps.currentToken(anilistId);
    bucket.set(anilistId, { deferred, token });
    this.deps.inflight.set(anilistId, { promise: deferred.promise, kind: 'batch', token });
    this.schedulePausedFlush();
    return deferred.promise;
  }

  public async flushPausedQueue(): Promise<void> {
    if (this.deps.getPausedUntil() > Date.now()) {
      this.schedulePausedFlush();
      return;
    }

    const priorities: RequestPriority[] = ['high', 'normal', 'low'];
    for (const priority of priorities) {
      const bucket = this.pausedByPriority.get(priority);
      if (!bucket || bucket.size === 0) continue;

      const entries = Array.from(bucket.entries());
      bucket.clear();

      const active: Array<{ id: number; deferred: Deferred<AniMedia>; token: number }> = [];
      for (const [id, entry] of entries) {
        const current = this.deps.currentToken(id);
        if (current !== entry.token) {
          entry.deferred.reject(
            createError(ErrorCode.API_ERROR, `AniList request preempted for ${id}`, 'Request superseded.', {
              preempted: true,
            }),
          );
          const inflight = this.deps.inflight.get(id);
          if (inflight && inflight.promise === entry.deferred.promise) {
            this.deps.inflight.delete(id);
          }
          continue;
        }
        active.push({ id, deferred: entry.deferred, token: entry.token });
      }

      if (active.length === 0) continue;

      for (let i = 0; i < active.length; i += MAX_BATCH_SIZE) {
        const chunk = active.slice(i, i + MAX_BATCH_SIZE);
        await this.runPausedChunk(priority, chunk);
      }
    }
  }

  private getPausedBucket(priority: RequestPriority): Map<number, { deferred: Deferred<AniMedia>; token: number }> {
    let bucket = this.pausedByPriority.get(priority);
    if (!bucket) {
      bucket = new Map();
      this.pausedByPriority.set(priority, bucket);
    }
    return bucket;
  }

  private schedulePausedFlush(): void {
    if (this.pausedFlushTimer) {
      clearTimeout(this.pausedFlushTimer);
      this.pausedFlushTimer = null;
    }

    const delay = Math.max(0, this.deps.getPausedUntil() - Date.now());
    this.pausedFlushTimer = setTimeout(() => {
      this.pausedFlushTimer = null;
      void this.flushPausedQueue();
    }, delay);
  }

  private async runPausedChunk(
    priority: RequestPriority,
    entries: Array<{ id: number; deferred: Deferred<AniMedia>; token: number }>,
  ): Promise<void> {
    if (entries.length === 0) return;

    const prio = priorityValue(priority);
    const ids = entries.map(entry => entry.id);
    const entryById = new Map<number, { deferred: Deferred<AniMedia>; token: number }>();
    for (const entry of entries) entryById.set(entry.id, { deferred: entry.deferred, token: entry.token });

    const run = async (): Promise<AniMedia[]> => {
      for (const id of ids) this.deps.batchRunningIds.add(id);
      try {
        if (ids.length === 1) {
          const [firstId] = ids;
          const single = firstId !== undefined ? await this.deps.executor.fetchMedia(firstId) : null;
          return single ? [single] : [];
        }
        return await this.deps.executor.fetchBatch(ids);
      } finally {
        for (const id of ids) this.deps.batchRunningIds.delete(id);
      }
    };

    let medias: AniMedia[];
    try {
      medias = await this.deps.queue.add(run, { priority: prio });
    } catch (error) {
      for (const { id, deferred } of entries) {
        deferred.reject(error);
        const inflight = this.deps.inflight.get(id);
        if (inflight && inflight.promise === deferred.promise) {
          this.deps.inflight.delete(id);
        }
      }
      return;
    }

    const resolved = new Set<number>();
    for (const media of medias) {
      if (!media || typeof media.id !== 'number') continue;
      const cached = await cacheMedia(this.deps.cache, media.id, media);
      resolved.add(media.id);
      const target = entryById.get(media.id);
      if (target) {
        target.deferred.resolve(cached);
        const inflight = this.deps.inflight.get(media.id);
        if (inflight && inflight.promise === target.deferred.promise) {
          this.deps.inflight.delete(media.id);
        }
      }
    }

    for (const { id, deferred } of entries) {
      if (resolved.has(id)) continue;
      deferred.reject(
        createError(
          ErrorCode.API_ERROR,
          `AniList response missing media for ${id}`,
          'AniList returned an unexpected response.',
        ),
      );
      const inflight = this.deps.inflight.get(id);
      if (inflight && inflight.promise === deferred.promise) {
        this.deps.inflight.delete(id);
      }
    }
  }
}
