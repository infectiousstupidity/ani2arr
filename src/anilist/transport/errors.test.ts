/** Focused tests for AniList transport error guards and custom error fields. */
// src/anilist/transport/errors.test.ts

import { describe, expect, it } from 'vitest';
import {
  AniListGraphqlError,
  AniListHttpError,
  AniListRateLimitError,
  isGraphqlError,
  isHttpError,
  isRateLimitError,
} from '@/anilist/transport/errors';
import type { AniListResponseMeta } from '@/anilist/transport/types';

const createMeta = (receivedAt = 1000): AniListResponseMeta => ({
  status: 429,
  rateLimit: {
    limit: null,
    remaining: null,
    resetAt: null,
    retryAfterMs: null,
  },
  receivedAt,
});

describe('AniList transport error guards', () => {
  it('matches real custom errors only by class', () => {
    const graphqlError = new AniListGraphqlError([{ message: 'GraphQL failed' }]);
    const rateLimitError = new AniListRateLimitError(createMeta(), 1250);
    const httpError = new AniListHttpError(503);

    expect(isGraphqlError(graphqlError)).toBe(true);
    expect(isGraphqlError(rateLimitError)).toBe(false);
    expect(isGraphqlError(httpError)).toBe(false);

    expect(isRateLimitError(rateLimitError)).toBe(true);
    expect(isRateLimitError(graphqlError)).toBe(false);
    expect(isRateLimitError(httpError)).toBe(false);

    expect(isHttpError(httpError)).toBe(true);
    expect(isHttpError(graphqlError)).toBe(false);
    expect(isHttpError(rateLimitError)).toBe(false);
  });

  it('rejects structural lookalikes', () => {
    expect(isGraphqlError({ name: 'AniListGraphqlError', errors: [] })).toBe(false);
    expect(isRateLimitError({ retryAfterMs: 250, pausedUntil: 1250 })).toBe(false);
    expect(isHttpError({ name: 'AniListHttpError', status: 503 })).toBe(false);
  });

  it('keeps custom error fields and HTTP client-error semantics', () => {
    const meta = createMeta(1000);
    const rateLimitError = new AniListRateLimitError(meta, 1250);

    expect(rateLimitError.status).toBe(429);
    expect(rateLimitError.meta).toBe(meta);
    expect(rateLimitError.pausedUntil).toBe(1250);
    expect(rateLimitError.retryAfterMs).toBe(250);

    expect(new AniListHttpError(404).isClientError).toBe(true);
    expect(new AniListHttpError(429).isClientError).toBe(true);
    expect(new AniListHttpError(500).isClientError).toBe(false);
  });
});
