/** Client-side AniList rate-limit state and dispatch pacing policy. */
// src/clients/anilist/rate-limit.ts

import { DEFAULT_ANILIST_RETRY_AFTER_MS } from '@/integrations/anilist/constants';
import type { RequestPriority } from '@/shared/types';
import type { AniListRateLimitMeta, AniListResponseMeta } from '@/integrations/anilist/types';
import { logger } from '@/shared/utils/logger';
import {
  LOW_PRIORITY_MIN_DISPATCH_GAP_MS,
  LOW_PRIORITY_REMAINING_FLOOR,
  LOW_PRIORITY_REMAINING_RATIO,
} from './constants';

export interface AniListRateLimitStateSnapshot {
  pausedUntil: number;
  lastKnownLimit: number | null;
  lastKnownRemaining: number | null;
  lastKnownResetAt: number | null;
  last429At: number | null;
}

type LimiterEventType = 'success' | 'rate-limit' | 'resume';
type LimiterListener = (
  event: LimiterEventType,
  snapshot: AniListRateLimitStateSnapshot,
  meta: AniListResponseMeta,
) => void;

export class AniListRateLimiter {
  private readonly log = logger.create('AniListLimiter');
  private pausedUntil = 0;
  private lastKnownLimit: number | null = null;
  private lastKnownRemaining: number | null = null;
  private lastKnownResetAt: number | null = null;
  private last429At: number | null = null;
  private lastLowDispatchAt: number | null = null;
  private listener: LimiterListener | null = null;

  public setListener(listener: LimiterListener | null): void {
    this.listener = listener;
  }

  public updateFromSuccess(meta: AniListResponseMeta): void {
    const wasPaused = this.pausedUntil > meta.receivedAt;
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

    this.listener?.('success', this.snapshot(), meta);
    if (wasPaused && this.pausedUntil <= meta.receivedAt) {
      this.listener?.('resume', this.snapshot(), meta);
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
    this.last429At = meta.receivedAt;

    if (import.meta.env.DEV) {
      this.log.debug?.(
        `anilist:limiter rate-limit remaining=${String(this.lastKnownRemaining)} limit=${String(this.lastKnownLimit)} resetAt=${String(this.lastKnownResetAt)} pausedUntil=${this.pausedUntil}`,
      );
    }

    this.listener?.('rate-limit', this.snapshot(), meta);

    return this.pausedUntil;
  }

  public recordDispatch(priority: RequestPriority, at = Date.now()): void {
    if (priority === 'low') {
      this.lastLowDispatchAt = at;
    }
  }

  public canDispatch(priority: RequestPriority, now = Date.now()): boolean {
    return this.nextDispatchAt(priority, now) <= now;
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

  public snapshot(): AniListRateLimitStateSnapshot {
    return {
      pausedUntil: this.pausedUntil,
      lastKnownLimit: this.lastKnownLimit,
      lastKnownRemaining: this.lastKnownRemaining,
      lastKnownResetAt: this.lastKnownResetAt,
      last429At: this.last429At,
    };
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
