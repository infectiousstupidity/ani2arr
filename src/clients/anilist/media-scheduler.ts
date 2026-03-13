import type { TtlCache } from '@/cache';
import { createError, ErrorCode } from '@/shared/errors/error-utils';
import type {
  AniListSchedulerBatchDebug,
  AniListSchedulerBatchMediaCountsDebug,
  AniListSchedulerBucketDebug,
  AniListSchedulerDebugSnapshot,
  AniListSchedulerEventDebug,
  AniListSchedulerPendingEntryDebug,
  AniListSchedulerRequestDebug,
  AniMedia,
  RequestPriority,
} from '@/shared/types';
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
  requestIds: Set<number>;
  enqueuedAt: number;
  promotedFrom: RequestPriority | null;
};

type InflightEntry = {
  promise: Promise<AniMedia>;
  priority: RequestPriority;
  batchId: number | null;
  requestIds: Set<number>;
  sources: Set<string>;
};

type MediaSchedulerDeps = {
  cache?: TtlCache<AniMedia>;
  executor: AniListExecutor;
  limiter: AniListRateLimiter;
  dispatchTask: <T>(task: () => Promise<T>, priority: number) => Promise<T>;
};

const PRIORITIES: RequestPriority[] = ['high', 'normal', 'low'];
const MAX_RECENT_REQUESTS = 80;
const MAX_RECENT_BATCHES = 40;
const MAX_RECENT_EVENTS = 160;

const COALESCE_MS: Record<RequestPriority, number> = {
  high: 0,
  normal: 35,
  low: 150,
};

const createEmptyMediaCounts = (): AniListSchedulerBatchMediaCountsDebug => ({
  movies: 0,
  series: 0,
  specials: 0,
  music: 0,
  other: 0,
  unknown: 0,
});

export class AniListMediaScheduler {
  private readonly log = logger.create('AniListMediaScheduler');
  private readonly pendingByPriority = new Map<RequestPriority, Map<number, PendingEntry>>(
    PRIORITIES.map(priority => [priority, new Map<number, PendingEntry>()]),
  );
  private readonly pendingById = new Map<number, PendingEntry>();
  private readonly bucketReadyAt = new Map<RequestPriority, number>();
  private readonly inflightById = new Map<number, InflightEntry>();
  private readonly recentRequests: AniListSchedulerRequestDebug[] = [];
  private readonly recentBatches: AniListSchedulerBatchDebug[] = [];
  private readonly recentEvents: AniListSchedulerEventDebug[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushScheduledAt: number | null = null;
  private isFlushing = false;
  private nextRequestId = 1;
  private nextBatchId = 1;
  private nextEventId = 1;

  constructor(private readonly deps: MediaSchedulerDeps) {
    this.deps.limiter.setListener((event, snapshot, meta) => {
      if (event === 'success') {
        return;
      }

      const message = event === 'resume'
        ? 'Limiter window reopened'
        : 'AniList rate limit triggered';

      this.recordEvent({
        at: meta.receivedAt,
        type: event === 'resume' ? 'resume' : 'rate-limit',
        priority: null,
        requestId: null,
        batchId: null,
        ids: [],
        message,
        details: {
          pausedUntil: snapshot.pausedUntil,
          remaining: snapshot.lastKnownRemaining,
          limit: snapshot.lastKnownLimit,
          resetAt: snapshot.lastKnownResetAt,
        },
      });
    });
  }

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
    const request = this.registerRequest([normalizedId], normalizedOptions);

    if (!normalizedOptions.forceRefresh) {
      const cached = await this.readCachedMedia(normalizedId);
      if (cached) {
        this.recordEvent({
          at: Date.now(),
          type: 'cache-hit',
          priority: normalizedOptions.priority,
          requestId: request.requestId,
          batchId: null,
          ids: [normalizedId],
          message: 'Satisfied single request from cache',
          details: {
            stale: cached.stale,
          },
        });

        if (cached.stale) {
          this.refreshInBackground([normalizedId], normalizedOptions);
        }
        return cached.media;
      }
    }

    return this.ensureNetworkRequest(normalizedId, normalizedOptions, request.requestId);
  }

  public async requestMedia(ids: number[], options: RequestMediaOptions = {}): Promise<Map<number, AniMedia>> {
    const normalizedOptions = this.normalizeOptions(options);
    const uniqueIds = this.normalizeIds(ids);
    const request = this.registerRequest(uniqueIds, normalizedOptions);
    const results = new Map<number, AniMedia>();
    const pending = new Map<number, Promise<AniMedia>>();

    for (const id of uniqueIds) {
      if (!normalizedOptions.forceRefresh) {
        const cached = await this.readCachedMedia(id);
        if (cached) {
          results.set(id, cached.media);
          this.recordEvent({
            at: Date.now(),
            type: 'cache-hit',
            priority: normalizedOptions.priority,
            requestId: request.requestId,
            batchId: null,
            ids: [id],
            message: 'Satisfied batch member from cache',
            details: {
              stale: cached.stale,
            },
          });
          if (cached.stale) {
            this.refreshInBackground([id], normalizedOptions);
          }
          continue;
        }
      }

      pending.set(id, this.ensureNetworkRequest(id, normalizedOptions, request.requestId));
    }

    if (pending.size === 0) {
      return results;
    }

    const settled = await Promise.allSettled(
      Array.from(pending.entries()).map(async ([queuedId, promise]) => [queuedId, await promise] as const),
    );

    const rejected: unknown[] = [];
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        const [resolvedId, media] = outcome.value;
        results.set(resolvedId, media);
      } else {
        rejected.push(outcome.reason);
      }
    }

    if (rejected.length > 0 && results.size === 0) {
      throw rejected[0];
    }

    return results;
  }

  public getDebugSnapshot(): AniListSchedulerDebugSnapshot {
    const now = Date.now();
    const pendingBuckets = PRIORITIES.map(priority => {
      const entries = Array.from(this.pendingByPriority.get(priority)?.values() ?? []);
      const logicalRequestIds = Array.from(new Set(entries.flatMap(entry => Array.from(entry.requestIds)))).sort(
        (a, b) => a - b,
      );

      return {
        priority,
        count: entries.length,
        ids: entries.map(entry => entry.id),
        logicalRequestIds,
        entries: entries.map(entry => this.toPendingEntryDebug(entry)),
      } satisfies AniListSchedulerBucketDebug;
    });

    return {
      generatedAt: now,
      nextFlushAt: this.flushScheduledAt ?? this.computeNextWakeAt(now),
      inflightIds: Array.from(this.inflightById.keys()).sort((a, b) => a - b),
      pendingCounts: {
        high: this.pendingByPriority.get('high')?.size ?? 0,
        normal: this.pendingByPriority.get('normal')?.size ?? 0,
        low: this.pendingByPriority.get('low')?.size ?? 0,
      },
      pendingBuckets,
      recentRequests: [...this.recentRequests].reverse(),
      recentBatches: [...this.recentBatches].reverse(),
      recentEvents: [...this.recentEvents].reverse(),
      limiter: {
        ...this.deps.limiter.snapshot(),
        lowPriorityHeld: this.deps.limiter.shouldHoldLowPriority(),
        nextDispatchAtHigh: this.deps.limiter.nextDispatchAt('high', now),
        nextDispatchAtNormal: this.deps.limiter.nextDispatchAt('normal', now),
        nextDispatchAtLow: this.deps.limiter.nextDispatchAt('low', now),
      },
    };
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

  private registerRequest(ids: number[], options: Required<RequestMediaOptions>): AniListSchedulerRequestDebug {
    const request: AniListSchedulerRequestDebug = {
      requestId: this.nextRequestId++,
      at: Date.now(),
      priority: options.priority,
      source: options.source,
      ids,
      forceRefresh: options.forceRefresh,
    };

    this.pushRecent(this.recentRequests, request, MAX_RECENT_REQUESTS);
    this.recordEvent({
      at: request.at,
      type: 'request',
      priority: request.priority,
      requestId: request.requestId,
      batchId: null,
      ids,
      message: `Logical request ${request.requestId} received`,
      details: {
        source: request.source,
        forceRefresh: request.forceRefresh,
        size: ids.length,
      },
    });

    return request;
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
      const refreshRequest = this.registerRequest([id], {
        ...options,
        forceRefresh: true,
        source: `${options.source}:refresh`,
      });
      void this
        .ensureNetworkRequest(id, {
          ...options,
          forceRefresh: true,
          source: `${options.source}:refresh`,
        }, refreshRequest.requestId)
        .catch(error => {
          this.log.warn(`background refresh failed for AniList ID ${id}`, error);
        });
    }
  }

  private ensureNetworkRequest(
    id: number,
    options: Required<RequestMediaOptions>,
    requestId: number,
  ): Promise<AniMedia> {
    const inflight = this.inflightById.get(id);
    if (inflight) {
      inflight.requestIds.add(requestId);
      inflight.sources.add(options.source);
      if (inflight.batchId !== null) {
        const batch = this.recentBatches.find(candidate => candidate.batchId === inflight.batchId);
        if (batch) {
          batch.joinedInflightCount += 1;
        }
      }
      this.recordEvent({
        at: Date.now(),
        type: 'join-inflight',
        priority: inflight.priority,
        requestId,
        batchId: inflight.batchId,
        ids: [id],
        message: `Request ${requestId} joined inflight AniList work`,
        details: {
          source: options.source,
        },
      });
      return inflight.promise;
    }

    const existingPending = this.pendingById.get(id);
    if (existingPending) {
      existingPending.forceRefresh ||= options.forceRefresh;
      existingPending.sources.add(options.source);
      existingPending.requestIds.add(requestId);
      this.recordEvent({
        at: Date.now(),
        type: 'enqueue',
        priority: existingPending.priority,
        requestId,
        batchId: null,
        ids: [id],
        message: `Request ${requestId} merged into pending AniList entry`,
        details: {
          source: options.source,
          waiterCount: existingPending.requestIds.size,
        },
      });
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
      requestIds: new Set([requestId]),
      enqueuedAt: Date.now(),
      promotedFrom: null,
    };

    this.pendingByPriority.get(options.priority)?.set(id, entry);
    this.pendingById.set(id, entry);
    this.bumpBucketReadyAt(options.priority, Date.now() + COALESCE_MS[options.priority]);

    if (import.meta.env.DEV) {
      this.log.debug?.(
        `anilist:scheduler enqueue priority=${options.priority} ids=1 pending=${this.pendingByPriority.get(options.priority)?.size ?? 0} source=${options.source}`,
      );
    }

    this.recordEvent({
      at: entry.enqueuedAt,
      type: 'enqueue',
      priority: entry.priority,
      requestId,
      batchId: null,
      ids: [id],
      message: `Queued AniList ID ${id}`,
      details: {
        source: options.source,
        pending: this.pendingByPriority.get(options.priority)?.size ?? 0,
      },
    });

    this.ensureFlushScheduled();
    return deferred.promise;
  }

  private promotePendingEntry(entry: PendingEntry, nextPriority: RequestPriority): void {
    if (priorityValue(nextPriority) <= priorityValue(entry.priority)) {
      this.ensureFlushScheduled();
      return;
    }

    const previousPriority = entry.priority;
    this.pendingByPriority.get(previousPriority)?.delete(entry.id);
    this.resetBucketIfEmpty(previousPriority);

    entry.priority = nextPriority;
    entry.promotedFrom = entry.promotedFrom ?? previousPriority;
    this.pendingByPriority.get(nextPriority)?.set(entry.id, entry);
    this.bumpBucketReadyAt(nextPriority, Date.now() + COALESCE_MS[nextPriority]);

    if (import.meta.env.DEV) {
      this.log.debug?.(`anilist:scheduler promote id=${entry.id} priority=${nextPriority}`);
    }

    this.recordEvent({
      at: Date.now(),
      type: 'promote',
      priority: nextPriority,
      requestId: null,
      batchId: null,
      ids: [entry.id],
      message: `Promoted AniList ID ${entry.id} to ${nextPriority}`,
      details: {
        from: previousPriority,
      },
    });

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
        const holdingLow = priority === 'low' && this.deps.limiter.shouldHoldLowPriority();
        if (holdingLow) {
          this.recordEvent({
            at: now,
            type: 'hold',
            priority: 'low',
            requestId: null,
            batchId: null,
            ids: [],
            message: 'Holding low-priority AniList work',
            details: {
              reason: 'remaining-threshold',
              pending: bucket.size,
              nextAt: readyAt,
            },
          });
        }

        if (import.meta.env.DEV && holdingLow) {
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

    const batchId = this.nextBatchId++;
    const readyEntries: PendingEntry[] = [];
    const contributorRequestIds = new Set<number>();
    const contributorSources = new Set<string>();
    let cachedCount = 0;

    for (const entry of entries) {
      entry.requestIds.forEach(requestId => contributorRequestIds.add(requestId));
      entry.sources.forEach(source => contributorSources.add(source));

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

    const requestedIds = readyEntries.map(entry => entry.id);
    const logicalRequestedIdCount = readyEntries.reduce((total, entry) => total + entry.requestIds.size, 0);
    const promotedIds = readyEntries
      .filter(entry => entry.promotedFrom !== null)
      .map(entry => entry.id);

    const batchDebug: AniListSchedulerBatchDebug = {
      batchId,
      at: Date.now(),
      completedAt: null,
      priority,
      contributorRequestIds: Array.from(contributorRequestIds).sort((a, b) => a - b),
      contributorSources: Array.from(contributorSources).sort(),
      logicalRequestedIdCount,
      uniqueRequestedIdCount: requestedIds.length,
      uniqueSentIdCount: requestedIds.length,
      dedupeSavedCount: Math.max(0, logicalRequestedIdCount - requestedIds.length),
      cacheHitCount: cachedCount,
      joinedInflightCount: 0,
      requestedIds,
      sentIds: [],
      promotedIds,
      mediaCounts: createEmptyMediaCounts(),
    };
    this.pushRecent(this.recentBatches, batchDebug, MAX_RECENT_BATCHES);

    for (const entry of readyEntries) {
      bucket.delete(entry.id);
      this.pendingById.delete(entry.id);
      this.inflightById.set(entry.id, {
        promise: entry.deferred.promise,
        priority,
        batchId,
        requestIds: new Set(entry.requestIds),
        sources: new Set(entry.sources),
      });
    }
    this.resetBucketIfEmpty(priority);

    this.deps.limiter.recordDispatch(priority);

    if (import.meta.env.DEV) {
      this.log.debug?.(
        `anilist:scheduler flush priority=${priority} requested=${entries.length} sent=${requestedIds.length} cached=${cachedCount}`,
      );
    }

    this.recordEvent({
      at: batchDebug.at,
      type: 'flush',
      priority,
      requestId: null,
      batchId,
      ids: requestedIds,
      message: `Dispatching AniList batch ${batchId}`,
      details: {
        contributors: batchDebug.contributorRequestIds.length,
        logicalRequested: batchDebug.logicalRequestedIdCount,
        dedupeSaved: batchDebug.dedupeSavedCount,
        cached: batchDebug.cacheHitCount,
      },
    });

    try {
      const medias = await this.deps.dispatchTask(
        () => this.deps.executor.fetchBatch(requestedIds),
        priorityValue(priority),
      );

      const resolved = new Set<number>();
      for (const media of medias) {
        if (!media || typeof media.id !== 'number') continue;

        const cached = await cacheMedia(this.deps.cache, media.id, media);
        const entry = readyEntries.find(candidate => candidate.id === media.id);
        if (!entry) continue;

        resolved.add(media.id);
        batchDebug.sentIds.push(media.id);
        this.countResolvedMedia(batchDebug.mediaCounts, media.format ?? null);
        entry.deferred.resolve(cached);
        this.clearInflight(entry);
      }

      batchDebug.uniqueSentIdCount = batchDebug.sentIds.length;
      batchDebug.completedAt = Date.now();

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
      batchDebug.completedAt = Date.now();
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

  private toPendingEntryDebug(entry: PendingEntry): AniListSchedulerPendingEntryDebug {
    return {
      id: entry.id,
      priority: entry.priority,
      waiterCount: entry.requestIds.size,
      requestIds: Array.from(entry.requestIds).sort((a, b) => a - b),
      sources: Array.from(entry.sources).sort(),
      forceRefresh: entry.forceRefresh,
      enqueuedAt: entry.enqueuedAt,
      promotedFrom: entry.promotedFrom,
    };
  }

  private recordEvent(input: Omit<AniListSchedulerEventDebug, 'eventId'>): void {
    const event: AniListSchedulerEventDebug = {
      eventId: this.nextEventId++,
      ...input,
    };

    this.pushRecent(this.recentEvents, event, MAX_RECENT_EVENTS);
  }

  private pushRecent<T>(target: T[], item: T, maxSize: number): void {
    target.push(item);
    if (target.length > maxSize) {
      target.splice(0, target.length - maxSize);
    }
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

  private countResolvedMedia(counts: AniListSchedulerBatchMediaCountsDebug, format: AniMedia['format']): void {
    switch (format) {
      case 'MOVIE':
        counts.movies += 1;
        return;
      case 'TV':
      case 'TV_SHORT':
      case 'OVA':
      case 'ONA':
        counts.series += 1;
        return;
      case 'SPECIAL':
        counts.specials += 1;
        return;
      case 'MUSIC':
        counts.music += 1;
        return;
      case null:
        counts.unknown += 1;
        return;
      default:
        counts.other += 1;
    }
  }
}
