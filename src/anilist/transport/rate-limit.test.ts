/** Focused tests for AniList transport rate-limit parsing helpers. */
// src/anilist/transport/rate-limit.test.ts

import { describe, expect, it } from 'vitest';
import { parseAniListRateLimitHeaders, parseRetryAfterMs } from './rate-limit';

describe('AniList transport rate-limit helpers', () => {
  it('parses retry-after seconds and HTTP dates', () => {
    expect(parseRetryAfterMs('5', 1000)).toBe(5000);
    expect(parseRetryAfterMs('Wed, 01 Jan 2025 00:00:10 GMT', Date.UTC(2025, 0, 1, 0, 0, 0))).toBe(10_000);
  });

  it('rejects invalid or non-positive retry-after values', () => {
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs('0')).toBeNull();
    expect(parseRetryAfterMs('-5')).toBeNull();
    expect(parseRetryAfterMs('not-a-date')).toBeNull();
    expect(parseRetryAfterMs('Wed, 01 Jan 2025 00:00:00 GMT', Date.UTC(2025, 0, 1, 0, 0, 0))).toBeNull();
  });

  it('parses AniList rate-limit headers into canonical metadata', () => {
    const headers = new Headers({
      'X-RateLimit-Limit': '120',
      'X-RateLimit-Remaining': '2',
      'X-RateLimit-Reset': '1234',
      'Retry-After': '7',
    });

    expect(parseAniListRateLimitHeaders(headers, 10_000)).toEqual({
      limit: 120,
      remaining: 2,
      resetAt: 1_234_000,
      retryAfterMs: 7000,
    });
  });
});
