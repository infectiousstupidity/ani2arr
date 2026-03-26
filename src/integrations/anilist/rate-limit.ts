/** AniList response metadata and rate-limit header parsing helpers. */
// src/integrations/anilist/rate-limit.ts

import type { AniListRateLimitMeta, AniListResponseMeta } from '@/integrations/anilist/types';

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

export function parseAniListRateLimitHeaders(headers: Headers, now = Date.now()): AniListRateLimitMeta {
  const limit = parseHeaderNumber(headers.get('X-RateLimit-Limit'));
  const remaining = parseHeaderNumber(headers.get('X-RateLimit-Remaining'));
  const resetSeconds = parseHeaderNumber(headers.get('X-RateLimit-Reset'));
  const retryAfterMs = parseRetryAfterMs(headers.get('Retry-After'), now);

  return {
    limit,
    remaining,
    resetAt: typeof resetSeconds === 'number' && Number.isFinite(resetSeconds) ? resetSeconds * 1000 : null,
    retryAfterMs,
  };
}

export function toAniListResponseMeta(response: Response, now = Date.now()): AniListResponseMeta {
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    rateLimit: parseAniListRateLimitHeaders(response.headers, now),
    receivedAt: now,
  };
}
