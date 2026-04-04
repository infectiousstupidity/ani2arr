/** AniList-specific request pacing state used by the media scheduler. */
// src/anilist/rate-limiter.ts

import { DEFAULT_ANILIST_RETRY_AFTER_MS } from '@/anilist/transport/constants';
import type { AniListRateLimitMeta, AniListResponseMeta } from '@/anilist/transport/types';
import type { RequestPriority } from '@/shared/utils/request-priority';
import { logger } from '@/shared/utils/logger';
import {
  LOW_PRIORITY_MIN_DISPATCH_GAP_MS,
  LOW_PRIORITY_REMAINING_FLOOR,
  LOW_PRIORITY_REMAINING_RATIO,
} from './constants';

export class AniListRateLimiter {
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
