import type { TtlCache } from '@/cache';
import { createError, ErrorCode } from '@/shared/errors/error-utils';
import type { AniMedia, RequestPriority } from '@/shared/types';
import { priorityValue } from '@/shared/utils/priority';
import { logger } from '@/shared/utils/logger';
import { MAX_BATCH_SIZE } from './constants';
import type { AniListExecutor } from './executor';
import {
  cacheMedia,
  hasCompleteMediaFields,
  normalizeMedia,
  sanitizeMedia,
} from './media-normalizer';
import type { AniListRateLimiter } from './rate-limit';

export interface RequestMediaOptions {
  priority?: RequestPriority;
  forceRefresh?: boolean;
  source?: string;
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

type PendingEntry = {
  id: number;
  deferred: Deferred<AniMedia>;
  priority: RequestPriority;
  forceRefresh: boolean;
  sources: Set<string>;
};

type InflightEntry = {
  promise: Promise<AniMedia>;
  priority: RequestPriority;
};

type MediaSchedulerDeps = {
  cache?: TtlCache<AniMedia>;
  executor: AniListExecutor;
  limiter: AniListRateLimiter;
  dispatchTask: <T>(task: () => Promise<T>, priority: number) => Promise<T>;
};

const PRIORITIES: RequestPriority[] = ['high', 'normal', 'low'];

const COALESCE_MS: Record<RequestPriority, number> = {
  high: 0,
  normal: 35,
  low: 150,
};

export class AniListMediaScheduler {
  private readonly log = logger.create('AniListMediaScheduler');
  private readonly pendingByPriority = new Map<RequestPriority, Map<number, PendingEntry>>(
    PRIORITIES.map(priority => [priority, new Map<number, PendingEntry>()]),
  );
  private readonly pendingById = new Map<number, PendingEntry>();
  private readonly bucketReadyAt = new Map<RequestPriority, number>();
  private readonly inflightById = new Map<number, InflightEntry>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushScheduledAt: number | null = null;
  private isFlushing = false;

  constructor(private readonly deps: MediaSchedulerDeps) {}

  public prioritize(ids: number | number[], priority: RequestPriority = 'high'): void {
    for (const id of this.normalizeIds(Array.isArray(ids) ? ids : [ids])) {
      const pending = this.pendingById.get(id);
      if (!pending) continue;
      this.promotePendingEntry(pending, priority);
    }
  }

  public async requestSingle(id: number, options: RequestMediaOptions = {}): Promise<AniMedia> {
    const [normalizedId] = this.normalizeIds([id]);
    if (typeof normalizedId !== 'number') {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        `Invalid AniList ID ${String(id)}`,
        'AniList request failed.',
      );
    }

    const normalizedOptions = this.normalizeOptions(options);
    if (!normalizedOptions.forceRefresh) {
      const cached = await this.readCachedMedia(normalizedId);
      if (cached) {
        if (cached.stale) {
          this.refreshInBackground([normalizedId], normalizedOptions);
        }
        return cached.media;
      }
    }

    return this.ensureNetworkRequest(normalizedId, normalizedOptions);
  }

  public async requestMedia(ids: number[], options: RequestMediaOptions = {}): Promise<Map<number, AniMedia>> {
    const normalizedOptions = this.normalizeOptions(options);
    const uniqueIds = this.normalizeIds(ids);
    const results = new Map<number, AniMedia>();
    const pending = new Map<number, Promise<AniMedia>>();

    for (const id of uniqueIds) {
      if (!normalizedOptions.forceRefresh) {
        const cached = await this.readCachedMedia(id);
        if (cached) {
          results.set(id, cached.media);
          if (cached.stale) {
            this.refreshInBackground([id], normalizedOptions);
          }
          continue;
        }
      }

      pending.set(id, this.ensureNetworkRequest(id, normalizedOptions));
    }

    if (pending.size === 0) {
      return results;
    }

    const settled = await Promise.allSettled(
      Array.from(pending.entries()).map(async ([id, promise]) => [id, await promise] as const),
    );

    const rejected: unknown[] = [];
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        const [id, media] = outcome.value;
        results.set(id, media);
      } else {
        rejected.push(outcome.reason);
      }
    }

    if (rejected.length > 0 && results.size === 0) {
      throw rejected[0];
    }

    return results;
  }

  private normalizeOptions(options: RequestMediaOptions): Required<RequestMediaOptions> {
    return {
      priority: options.priority ?? 'normal',
      forceRefresh: options.forceRefresh === true,
      source: options.source?.trim() || 'unknown',
    };
  }

  private normalizeIds(ids: number[]): number[] {
    return Array.from(new Set(ids.filter(id => typeof id === 'number' && Number.isFinite(id) && id > 0)));
  }

  private async readCachedMedia(id: number): Promise<{ media: AniMedia; stale: boolean } | null> {
    const cache = this.deps.cache;
    if (!cache) return null;

    const hit = await cache.read(String(id));
    if (!hit) return null;

    if (!hasCompleteMediaFields(hit.value)) {
      void cache.remove(String(id)).catch(() => {});
      return null;
    }

    return {
      media: sanitizeMedia(normalizeMedia(hit.value)),
      stale: hit.stale,
    };
  }

  private refreshInBackground(ids: number[], options: Required<RequestMediaOptions>): void {
    for (const id of ids) {
      void this
        .ensureNetworkRequest(id, {
          ...options,
          forceRefresh: true,
          source: `${options.source}:refresh`,
        })
        .catch(error => {
          this.log.warn(`background refresh failed for AniList ID ${id}`, error);
        });
    }
  }

  private ensureNetworkRequest(id: number, options: Required<RequestMediaOptions>): Promise<AniMedia> {
    const inflight = this.inflightById.get(id);
    if (inflight) {
      return inflight.promise;
    }

    const existingPending = this.pendingById.get(id);
    if (existingPending) {
      existingPending.forceRefresh ||= options.forceRefresh;
      existingPending.sources.add(options.source);
      this.promotePendingEntry(existingPending, options.priority);
      return existingPending.deferred.promise;
    }

    const deferred = this.createDeferred<AniMedia>();
    const entry: PendingEntry = {
      id,
      deferred,
      priority: options.priority,
      forceRefresh: options.forceRefresh,
      sources: new Set([options.source]),
    };

    this.pendingByPriority.get(options.priority)?.set(id, entry);
    this.pendingById.set(id, entry);
    this.bumpBucketReadyAt(options.priority, Date.now() + COALESCE_MS[options.priority]);

    if (import.meta.env.DEV) {
      this.log.debug?.(
        `anilist:scheduler enqueue priority=${options.priority} ids=1 pending=${this.pendingByPriority.get(options.priority)?.size ?? 0} source=${options.source}`,
      );
    }

    this.ensureFlushScheduled();
    return deferred.promise;
  }

  private promotePendingEntry(entry: PendingEntry, nextPriority: RequestPriority): void {
    if (priorityValue(nextPriority) <= priorityValue(entry.priority)) {
      this.ensureFlushScheduled();
      return;
    }

    this.pendingByPriority.get(entry.priority)?.delete(entry.id);
    this.resetBucketIfEmpty(entry.priority);

    entry.priority = nextPriority;
    this.pendingByPriority.get(nextPriority)?.set(entry.id, entry);
    this.bumpBucketReadyAt(nextPriority, Date.now() + COALESCE_MS[nextPriority]);

    if (import.meta.env.DEV) {
      this.log.debug?.(`anilist:scheduler promote id=${entry.id} priority=${nextPriority}`);
    }

    this.ensureFlushScheduled();
  }

  private ensureFlushScheduled(): void {
    if (this.isFlushing) return;

    const nextAt = this.computeNextWakeAt();
    if (nextAt === null) {
      this.clearFlushTimer();
      return;
    }

    if (this.flushScheduledAt !== null && this.flushScheduledAt <= nextAt) {
      return;
    }

    this.clearFlushTimer();

    const delay = Math.max(0, nextAt - Date.now());
    this.flushScheduledAt = nextAt;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushScheduledAt = null;
      void this.flush();
    }, delay);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushScheduledAt = null;
  }

  private computeNextWakeAt(now = Date.now()): number | null {
    for (const priority of PRIORITIES) {
      const bucket = this.pendingByPriority.get(priority);
      if (!bucket || bucket.size === 0) continue;

      const coalescedAt = this.bucketReadyAt.get(priority) ?? now;
      const limiterAt = this.deps.limiter.nextDispatchAt(priority, now);
      return Math.max(now, coalescedAt, limiterAt);
    }

    return null;
  }

  private async flush(): Promise<void> {
    if (this.isFlushing) return;
    this.isFlushing = true;

    try {
      while (true) {
        const next = this.pickNextChunk();
        if (!next) {
          break;
        }

        await this.dispatchChunk(next.priority, next.entries);
      }
    } finally {
      this.isFlushing = false;
      this.ensureFlushScheduled();
    }
  }

  private pickNextChunk(now = Date.now()): { priority: RequestPriority; entries: PendingEntry[] } | null {
    for (const priority of PRIORITIES) {
      const bucket = this.pendingByPriority.get(priority);
      if (!bucket || bucket.size === 0) continue;

      const readyAt = Math.max(
        this.bucketReadyAt.get(priority) ?? now,
        this.deps.limiter.nextDispatchAt(priority, now),
      );

      if (readyAt > now) {
        if (import.meta.env.DEV && priority === 'low' && this.deps.limiter.shouldHoldLowPriority()) {
          this.log.debug?.(
            `anilist:scheduler hold priority=low reason=remaining-threshold pending=${bucket.size}`,
          );
        }
        return null;
      }

      return {
        priority,
        entries: Array.from(bucket.values()).slice(0, MAX_BATCH_SIZE),
      };
    }

    return null;
  }

  private async dispatchChunk(priority: RequestPriority, entries: PendingEntry[]): Promise<void> {
    const bucket = this.pendingByPriority.get(priority);
    if (!bucket || entries.length === 0) return;

    const readyEntries: PendingEntry[] = [];
    let cachedCount = 0;

    for (const entry of entries) {
      if (!entry.forceRefresh) {
        const cached = await this.readCachedMedia(entry.id);
        if (cached && !cached.stale) {
          cachedCount += 1;
          this.resolvePendingEntry(entry, cached.media);
          continue;
        }
      }

      readyEntries.push(entry);
    }

    if (readyEntries.length === 0) {
      this.resetBucketIfEmpty(priority);
      return;
    }

    for (const entry of readyEntries) {
      bucket.delete(entry.id);
      this.pendingById.delete(entry.id);
      this.inflightById.set(entry.id, { promise: entry.deferred.promise, priority });
    }
    this.resetBucketIfEmpty(priority);

    const ids = readyEntries.map(entry => entry.id);
    this.deps.limiter.recordDispatch(priority);

    if (import.meta.env.DEV) {
      this.log.debug?.(
        `anilist:scheduler flush priority=${priority} requested=${entries.length} sent=${ids.length} cached=${cachedCount}`,
      );
    }

    try {
      const medias = await this.deps.dispatchTask(
        () => this.deps.executor.fetchBatch(ids),
        priorityValue(priority),
      );

      const resolved = new Set<number>();
      for (const media of medias) {
        if (!media || typeof media.id !== 'number') continue;

        const cached = await cacheMedia(this.deps.cache, media.id, media);
        const entry = readyEntries.find(candidate => candidate.id === media.id);
        if (!entry) continue;

        resolved.add(media.id);
        entry.deferred.resolve(cached);
        this.clearInflight(entry);
      }

      for (const entry of readyEntries) {
        if (resolved.has(entry.id)) continue;
        entry.deferred.reject(
          createError(
            ErrorCode.API_ERROR,
            `AniList response missing media for ${entry.id}`,
            'AniList returned an unexpected response.',
          ),
        );
        this.clearInflight(entry);
      }
    } catch (error) {
      for (const entry of readyEntries) {
        entry.deferred.reject(error);
        this.clearInflight(entry);
      }
      throw error;
    }
  }

  private resolvePendingEntry(entry: PendingEntry, media: AniMedia): void {
    this.pendingByPriority.get(entry.priority)?.delete(entry.id);
    this.pendingById.delete(entry.id);
    this.resetBucketIfEmpty(entry.priority);
    entry.deferred.resolve(media);
  }

  private clearInflight(entry: PendingEntry): void {
    const inflight = this.inflightById.get(entry.id);
    if (inflight && inflight.promise === entry.deferred.promise) {
      this.inflightById.delete(entry.id);
    }
  }

  private resetBucketIfEmpty(priority: RequestPriority): void {
    const bucket = this.pendingByPriority.get(priority);
    if (!bucket || bucket.size > 0) return;
    this.bucketReadyAt.delete(priority);
  }

  private bumpBucketReadyAt(priority: RequestPriority, readyAt: number): void {
    const current = this.bucketReadyAt.get(priority);
    this.bucketReadyAt.set(priority, typeof current === 'number' ? Math.min(current, readyAt) : readyAt);
  }

  private createDeferred<TValue>(): Deferred<TValue> {
    let resolve!: (value: TValue | PromiseLike<TValue>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<TValue>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }
}
