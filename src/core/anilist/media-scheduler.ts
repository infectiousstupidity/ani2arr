/** AniList media scheduling, pacing, batching, and request execution for the domain workflow. */
// src/core/anilist/media-scheduler.ts

import { DEFAULT_ANILIST_RETRY_AFTER_MS } from '@/integrations/anilist/constants';
import {
  isGraphqlError,
  isHttpError,
  isRateLimitError,
} from '@/integrations/anilist/errors';
import {
  fetchAniListMediaBatch,
  searchAniListMedia,
} from '@/integrations/anilist/media';
import type { AniListSearchMediaDto } from '@/integrations/anilist/media.schema';
import type {
  AniListRateLimitMeta,
  AniListResponseMeta,
} from '@/integrations/anilist/types';
import type { TtlCache } from '@/storage';
import { createError, ErrorCode } from '@/shared/errors';
import type { AniListMedia } from '@/shared/schemas/anilist/anilist-media.schema';
import type { RequestPriority } from '@/shared/utils/request-priority';
import { logger } from '@/shared/utils/logger';
import { priorityValue } from '@/shared/utils/request-priority';
import { AbortError, withRetry } from '@/shared/utils/retry';
import {
  LOW_PRIORITY_MIN_DISPATCH_GAP_MS,
  LOW_PRIORITY_REMAINING_FLOOR,
  LOW_PRIORITY_REMAINING_RATIO,
  MAX_BATCH_SIZE,
} from './constants';
import {
  cacheMedia,
  hasCompleteMediaFields,
  normalizeMedia,
  sanitizeMedia,
} from './media-normalizer';

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
  deferred: Deferred<AniListMedia>;
  priority: RequestPriority;
  forceRefresh: boolean;
};

type InflightEntry = {
  promise: Promise<AniListMedia>;
  priority: RequestPriority;
};

type MediaSchedulerDeps = {
  cache?: TtlCache<AniListMedia>;
  dispatchTask: <T>(task: () => Promise<T>, priority: number) => Promise<T>;
};

const PRIORITIES: RequestPriority[] = ['high', 'normal', 'low'];

const COALESCE_MS: Record<RequestPriority, number> = {
  high: 0,
  normal: 35,
  low: 150,
};

class AniListRateLimiter {
  private readonly log = logger.create('AniListLimiter');
  private pausedUntil = 0;
  private lastKnownLimit: number | null = null;
  private lastKnownRemaining: number | null = null;
  private lastKnownResetAt: number | null = null;
  private lastLowDispatchAt: number | null = null;

  public updateFromSuccess(meta: AniListResponseMeta): void {
    this.applyKnownRateLimit(meta.rateLimit);

    const { remaining, resetAt } = meta.rateLimit;
    const fallbackResetAt = meta.receivedAt + DEFAULT_ANILIST_RETRY_AFTER_MS;

    if (typeof remaining === 'number' && remaining <= 0) {
      this.pausedUntil = Math.max(this.pausedUntil, resetAt ?? fallbackResetAt);
    } else if (this.pausedUntil <= meta.receivedAt) {
      this.pausedUntil = 0;
    }

    if (import.meta.env.DEV) {
      this.log.debug?.(
        `anilist:limiter update remaining=${String(this.lastKnownRemaining)} limit=${String(this.lastKnownLimit)} resetAt=${String(this.lastKnownResetAt)} pausedUntil=${this.pausedUntil || 0}`,
      );
    }
  }

  public updateFromRateLimit(meta: AniListResponseMeta, pausedUntil?: number): number {
    this.applyKnownRateLimit(meta.rateLimit);

    const computedPausedUntil =
      pausedUntil ??
      meta.rateLimit.resetAt ??
      (typeof meta.rateLimit.retryAfterMs === 'number'
        ? meta.receivedAt + meta.rateLimit.retryAfterMs
        : meta.receivedAt + DEFAULT_ANILIST_RETRY_AFTER_MS);

    this.pausedUntil = Math.max(this.pausedUntil, computedPausedUntil);

    if (import.meta.env.DEV) {
      this.log.debug?.(
        `anilist:limiter rate-limit remaining=${String(this.lastKnownRemaining)} limit=${String(this.lastKnownLimit)} resetAt=${String(this.lastKnownResetAt)} pausedUntil=${this.pausedUntil}`,
      );
    }

    return this.pausedUntil;
  }

  public recordDispatch(priority: RequestPriority, at = Date.now()): void {
    if (priority === 'low') {
      this.lastLowDispatchAt = at;
    }
  }

  public nextDispatchAt(priority: RequestPriority, now = Date.now()): number {
    const activePauseUntil = this.pausedUntil > now ? this.pausedUntil : 0;
    let nextAt = activePauseUntil || now;

    if (priority === 'low') {
      if (this.shouldHoldLowPriority()) {
        nextAt = Math.max(nextAt, this.lastKnownResetAt ?? activePauseUntil ?? now);
      }

      if (typeof this.lastLowDispatchAt === 'number') {
        nextAt = Math.max(nextAt, this.lastLowDispatchAt + LOW_PRIORITY_MIN_DISPATCH_GAP_MS);
      }
    }

    return nextAt;
  }

  public shouldHoldLowPriority(): boolean {
    if (typeof this.lastKnownRemaining !== 'number') return false;

    const threshold =
      typeof this.lastKnownLimit === 'number' && this.lastKnownLimit > 0
        ? Math.max(LOW_PRIORITY_REMAINING_FLOOR, Math.ceil(this.lastKnownLimit * LOW_PRIORITY_REMAINING_RATIO))
        : LOW_PRIORITY_REMAINING_FLOOR;

    return this.lastKnownRemaining <= threshold;
  }

  private applyKnownRateLimit(rateLimit: AniListRateLimitMeta): void {
    if (typeof rateLimit.limit === 'number') {
      this.lastKnownLimit = rateLimit.limit;
    }
    if (typeof rateLimit.remaining === 'number') {
      this.lastKnownRemaining = rateLimit.remaining;
    }
    if (typeof rateLimit.resetAt === 'number') {
      this.lastKnownResetAt = rateLimit.resetAt;
    }
  }
}

export class AniListMediaScheduler {
  private readonly log = logger.create('AniListMediaScheduler');
  private readonly limiter = new AniListRateLimiter();
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

  public async requestSingle(id: number, options: RequestMediaOptions = {}): Promise<AniListMedia> {
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
          this.refreshInBackground(normalizedId, normalizedOptions);
        }
        return cached.media;
      }
    }

    return this.ensureNetworkRequest(normalizedId, normalizedOptions);
  }

  public async requestMedia(ids: number[], options: RequestMediaOptions = {}): Promise<Map<number, AniListMedia>> {
    const normalizedOptions = this.normalizeOptions(options);
    const uniqueIds = this.normalizeIds(ids);
    const results = new Map<number, AniListMedia>();
    const pending = new Map<number, Promise<AniListMedia>>();

    for (const id of uniqueIds) {
      if (!normalizedOptions.forceRefresh) {
        const cached = await this.readCachedMedia(id);
        if (cached) {
          results.set(id, cached.media);
          if (cached.stale) {
            this.refreshInBackground(id, normalizedOptions);
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
      [...pending.entries()].map(async ([queuedId, promise]) => [queuedId, await promise] as const),
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

  public searchMedia(search: string, limit: number): Promise<AniListSearchMediaDto[]> {
    return this.deps.dispatchTask(async () => {
      await this.waitForLimiterWindow('normal');
      return this.executeRequest(() => searchAniListMedia(search, limit), 'AniList request failed.');
    }, priorityValue('normal'));
  }

  private normalizeOptions(options: RequestMediaOptions): Required<RequestMediaOptions> {
    return {
      priority: options.priority ?? 'normal',
      forceRefresh: options.forceRefresh === true,
      source: options.source?.trim() || 'unknown',
    };
  }

  private normalizeIds(ids: number[]): number[] {
    return [...new Set(ids.filter(id => typeof id === 'number' && Number.isFinite(id) && id > 0))];
  }

  private async readCachedMedia(id: number): Promise<{ media: AniListMedia; stale: boolean } | null> {
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

  private refreshInBackground(id: number, options: Required<RequestMediaOptions>): void {
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

  private ensureNetworkRequest(
    id: number,
    options: Required<RequestMediaOptions>,
  ): Promise<AniListMedia> {
    const inflight = this.inflightById.get(id);
    if (inflight) {
      return inflight.promise;
    }

    const existingPending = this.pendingById.get(id);
    if (existingPending) {
      existingPending.forceRefresh ||= options.forceRefresh;
      this.promotePendingEntry(existingPending, options.priority);
      return existingPending.deferred.promise;
    }

    const deferred = this.createDeferred<AniListMedia>();
    const entry: PendingEntry = {
      id,
      deferred,
      priority: options.priority,
      forceRefresh: options.forceRefresh,
    };

    this.pendingByPriority.get(options.priority)?.set(id, entry);
    this.pendingById.set(id, entry);
    this.bumpBucketReadyAt(options.priority, Date.now() + COALESCE_MS[options.priority]);

    if (import.meta.env.DEV) {
      this.log.debug?.(
        `anilist:scheduler enqueue priority=${options.priority} pending=${this.pendingByPriority.get(options.priority)?.size ?? 0} source=${options.source}`,
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

    const previousPriority = entry.priority;
    this.pendingByPriority.get(previousPriority)?.delete(entry.id);
    this.resetBucketIfEmpty(previousPriority);

    entry.priority = nextPriority;
    this.pendingByPriority.get(nextPriority)?.set(entry.id, entry);
    this.bumpBucketReadyAt(nextPriority, Date.now() + COALESCE_MS[nextPriority]);

    if (import.meta.env.DEV) {
      this.log.debug?.(`anilist:scheduler promote id=${entry.id} priority=${nextPriority} from=${previousPriority}`);
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
      const limiterAt = this.limiter.nextDispatchAt(priority, now);
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
        if (!next) break;
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
        this.limiter.nextDispatchAt(priority, now),
      );

      if (readyAt > now) {
        if (import.meta.env.DEV && priority === 'low' && this.limiter.shouldHoldLowPriority()) {
          this.log.debug?.(
            `anilist:scheduler hold priority=low reason=remaining-threshold pending=${bucket.size}`,
          );
        }
        return null;
      }

      return {
        priority,
        entries: [...bucket.values()].slice(0, MAX_BATCH_SIZE),
      };
    }

    return null;
  }

  private async dispatchChunk(priority: RequestPriority, entries: PendingEntry[]): Promise<void> {
    const bucket = this.pendingByPriority.get(priority);
    if (!bucket || entries.length === 0) return;

    const readyEntries: PendingEntry[] = [];

    for (const entry of entries) {
      if (!entry.forceRefresh) {
        const cached = await this.readCachedMedia(entry.id);
        if (cached && !cached.stale) {
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

    for (const entry of readyEntries) {
      bucket.delete(entry.id);
      this.pendingById.delete(entry.id);
      this.inflightById.set(entry.id, {
        promise: entry.deferred.promise,
        priority,
      });
    }
    this.resetBucketIfEmpty(priority);

    this.limiter.recordDispatch(priority);

    if (import.meta.env.DEV) {
      this.log.debug?.(
        `anilist:scheduler flush priority=${priority} sent=${requestedIds.length}`,
      );
    }

    try {
      const medias = await this.deps.dispatchTask(
        () => this.fetchBatch(requestedIds),
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

  private resolvePendingEntry(entry: PendingEntry, media: AniListMedia): void {
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

  private async waitForLimiterWindow(priority: RequestPriority): Promise<void> {
    while (true) {
      const nextAt = this.limiter.nextDispatchAt(priority);
      const delay = nextAt - Date.now();
      if (delay <= 0) {
        return;
      }

      if (import.meta.env.DEV) {
        this.log.debug?.(`anilist:limiter wait priority=${priority} delayMs=${delay}`);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  private fetchBatch(ids: number[]): Promise<AniListMedia[]> {
    return this.executeRequest(() => fetchAniListMediaBatch(ids), 'AniList request failed.');
  }

  private async executeRequest<TResult>(
    task: () => Promise<{ data: TResult; meta: AniListResponseMeta }>,
    fallbackMessage: string,
  ): Promise<TResult> {
    try {
      const response = await this.requestWithRetry(task);
      return response.data;
    } catch (error) {
      return this.handleRequestError(error, fallbackMessage);
    }
  }

  private requestWithRetry<TResult>(
    task: () => Promise<{ data: TResult; meta: AniListResponseMeta }>,
  ): Promise<{ data: TResult; meta: AniListResponseMeta }> {
    return withRetry(async () => {
      const response = await task();
      this.limiter.updateFromSuccess(response.meta);
      return response;
    }, {
      retries: 3,
      minTimeout: 0,
      maxTimeout: 0,
      extractRetryAfterMs: error => this.extractRetryAfterMs(error),
      onFailedAttempt: ({ error }) => this.applyRateLimitPause(error),
      shouldAbort: error => this.shouldAbortRetry(error),
    });
  }

  private extractRetryAfterMs(error: unknown): number | undefined {
    const normalized = this.unwrapAbortError(error);
    if (isRateLimitError(normalized)) {
      return Math.max(0, normalized.pausedUntil - Date.now());
    }
    return undefined;
  }

  private applyRateLimitPause(error: unknown): void {
    const normalized = this.unwrapAbortError(error);
    if (isRateLimitError(normalized)) {
      this.limiter.updateFromRateLimit(normalized.meta, normalized.pausedUntil);
    }
  }

  private shouldAbortRetry(error: unknown): boolean {
    const normalized = this.unwrapAbortError(error);
    if (isGraphqlError(normalized)) return true;
    if (isHttpError(normalized)) {
      return normalized.isClientError && normalized.status !== 429;
    }
    return false;
  }

  private unwrapAbortError(error: unknown): unknown {
    if (error instanceof AbortError) {
      return (error as AbortError).originalError;
    }
    return error;
  }

  private handleRequestError(error: unknown, fallbackMessage: string): never {
    const normalized = this.unwrapAbortError(error);

    if (isGraphqlError(normalized)) {
      throw createError(
        ErrorCode.API_ERROR,
        normalized.message,
        'AniList request failed.',
      );
    }

    if (isHttpError(normalized)) {
      throw createError(
        ErrorCode.API_ERROR,
        `AniList API Error: ${normalized.status}`,
        normalized.status >= 500 ? 'AniList service is temporarily unavailable.' : 'AniList request failed.',
        { status: normalized.status },
      );
    }

    if (isRateLimitError(normalized)) {
      this.limiter.updateFromRateLimit(normalized.meta, normalized.pausedUntil);
      throw createError(
        ErrorCode.API_ERROR,
        'AniList rate limit exceeded',
        'AniList request failed.',
        { retryAfterMs: Math.max(0, normalized.pausedUntil - Date.now()) },
      );
    }

    if (normalized instanceof Error) {
      const withStatus = normalized as Error & { status?: number };
      if (typeof withStatus.status === 'number') {
        throw createError(
          ErrorCode.API_ERROR,
          `AniList API Error: ${withStatus.status}`,
          'AniList service is temporarily unavailable.',
          { status: withStatus.status },
        );
      }
      throw createError(ErrorCode.API_ERROR, normalized.message, fallbackMessage);
    }

    throw createError(
      ErrorCode.API_ERROR,
      'Unexpected error type in AniListMediaScheduler.handleRequestError',
      fallbackMessage,
      { originalError: normalized },
    );
  }
}
