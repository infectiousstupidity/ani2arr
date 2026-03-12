import type { RequestPriority } from '@/shared/types';
import { logger } from '@/shared/utils/logger';
import {
  DEFAULT_RATE_LIMIT_DELAY_MS,
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

export interface AniListRateLimitFields {
  limit: number | null;
  remaining: number | null;
  resetAt: number | null;
  retryAfterMs: number | null;
}

export interface AniListRequestMeta {
  status: number;
  headers: Record<string, string>;
  rateLimit: AniListRateLimitFields;
  receivedAt: number;
}

const parseHeaderNumber = (value: string | null): number | null => {
  if (!value) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export function parseRetryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;

  const numeric = Number(header);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric * 1000;
  }

  const parsed = Date.parse(header);
  if (Number.isNaN(parsed)) return null;

  const delayMs = parsed - now;
  return delayMs > 0 ? delayMs : null;
}

export function parseAniListRateLimitHeaders(headers: Headers, now = Date.now()): AniListRateLimitFields {
  const limit = parseHeaderNumber(headers.get('X-RateLimit-Limit'));
  const remaining = parseHeaderNumber(headers.get('X-RateLimit-Remaining'));
  const resetSeconds = parseHeaderNumber(headers.get('X-RateLimit-Reset'));
  const retryAfterMs = parseRetryAfterMs(headers.get('Retry-After'), now);

  return {
    limit,
    remaining,
    resetAt: typeof resetSeconds === 'number' ? resetSeconds * 1000 : null,
    retryAfterMs,
  };
}

export function toAniListRequestMeta(response: Response, now = Date.now()): AniListRequestMeta {
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    rateLimit: parseAniListRateLimitHeaders(response.headers, now),
    receivedAt: now,
  };
}

export class AniListRateLimiter {
  private readonly log = logger.create('AniListLimiter');
  private pausedUntil = 0;
  private lastKnownLimit: number | null = null;
  private lastKnownRemaining: number | null = null;
  private lastKnownResetAt: number | null = null;
  private last429At: number | null = null;
  private lastLowDispatchAt: number | null = null;

  public updateFromSuccess(meta: AniListRequestMeta): void {
    this.applyKnownRateLimit(meta.rateLimit);

    const { remaining, resetAt } = meta.rateLimit;
    const fallbackResetAt = meta.receivedAt + DEFAULT_RATE_LIMIT_DELAY_MS;

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

  public updateFromRateLimit(meta: AniListRequestMeta, pausedUntil?: number): number {
    this.applyKnownRateLimit(meta.rateLimit);

    const computedPausedUntil =
      pausedUntil ??
      meta.rateLimit.resetAt ??
      (typeof meta.rateLimit.retryAfterMs === 'number'
        ? meta.receivedAt + meta.rateLimit.retryAfterMs
        : meta.receivedAt + DEFAULT_RATE_LIMIT_DELAY_MS);

    this.pausedUntil = Math.max(this.pausedUntil, computedPausedUntil);
    this.last429At = meta.receivedAt;

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

  private applyKnownRateLimit(rateLimit: AniListRateLimitFields): void {
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
