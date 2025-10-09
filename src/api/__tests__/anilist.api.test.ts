import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { http } from 'msw';

import { AnilistApiService } from '../anilist.api';
import {
  createAniListHandlers,
  createAniListResolver,
  createAniListErrorHandler,
  testServer,
  withLatency,
  withRetryAfterSeconds,
  withStatus,
  withHeaders,
} from '@/testing';
import { ErrorCode, normalizeError } from '@/utils/error-handling';

const API_URL = 'https://graphql.anilist.co';

const advance = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
};

const spacing = (limit: number, margin = 2) =>
  Math.ceil(60_000 / Math.max(1, Math.round(limit) - margin));

describe('AnilistApiService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  it('deduplicates inflight requests and resolves identical promises only once', async () => {
    testServer.use(...createAniListHandlers(withLatency(50)));

    const service = new AnilistApiService();
    const fetchSpy = vi.spyOn(global, 'fetch');

    const promiseA = service.fetchMediaWithRelations(101);
    const promiseB = service.fetchMediaWithRelations(101);

    expect(promiseA).toBe(promiseB);

    await advance(50);
    await expect(promiseA).resolves.toMatchObject({ id: expect.any(Number) });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps inflight entry during backoff so duplicates dedupe', async () => {
    const rateLimit = createAniListResolver({
      ...withStatus(429),
      ...withRetryAfterSeconds(1),
    });
    const success = createAniListResolver();
    let calls = 0;

    testServer.use(
      http.post(API_URL, async (...args) =>
        calls++ === 0 ? rateLimit(...args) : success(...args),
      ),
    );

    const service = new AnilistApiService();
    const first = service.fetchMediaWithRelations(777);

    await advance(0);

    const second = service.fetchMediaWithRelations(777);
    expect(second).toBe(first);

    await advance(2_500);
    await first;

    expect(calls).toBe(2);
  });

  it('enforces adaptive spacing based on limit headers', async () => {
    const headersSequence = [
      { 'X-RateLimit-Limit': '90', 'X-RateLimit-Remaining': '88' },
      { 'X-RateLimit-Limit': '30', 'X-RateLimit-Remaining': '29' },
      { 'X-RateLimit-Limit': '30', 'X-RateLimit-Remaining': '28' },
    ];

    let callIndex = 0;
    testServer.use(
      http.post(API_URL, async (...args) => {
        const resolver = createAniListResolver({
          ...withHeaders(headersSequence[Math.min(callIndex, headersSequence.length - 1)]),
        });
        callIndex += 1;
        return resolver(...args);
      }),
    );

    const service = new AnilistApiService();
    const realFetch = global.fetch;
    const callTimes: number[] = [];
    vi.spyOn(global, 'fetch').mockImplementation(async (...args) => {
      callTimes.push(Date.now());
      return realFetch(...(args as Parameters<typeof fetch>));
    });

    const requests = [1, 2, 3].map(id => service.fetchMediaWithRelations(id));

    await advance(0);
    await advance(700);
    await advance(2_200);

    await Promise.all(requests);

    const spacing90 = spacing(90);
    const spacing30 = spacing(30);

    expect(callTimes[0]).toBe(0);
    expect(callTimes[1]).toBe(spacing90);
    expect(callTimes[2]).toBe(spacing90 + spacing30);
  });

  it('applies retry-after headers globally with safety buffer', async () => {
    const rateLimitResolver = createAniListResolver({
      ...withStatus(429),
      ...withRetryAfterSeconds(1),
    });
    const successResolver = createAniListResolver({
      ...withHeaders({ 'X-RateLimit-Limit': '90', 'X-RateLimit-Remaining': '89' }),
    });

    let callIndex = 0;
    testServer.use(
      http.post(API_URL, async (...args) => {
        callIndex += 1;
        if (callIndex === 1) {
          return rateLimitResolver(...args);
        }
        return successResolver(...args);
      }),
    );

    const service = new AnilistApiService();
    const realFetch = global.fetch;
    const callTimes: number[] = [];
    vi.spyOn(global, 'fetch').mockImplementation(async (...args) => {
      callTimes.push(Date.now());
      return realFetch(...(args as Parameters<typeof fetch>));
    });

    const result = service.fetchMediaWithRelations(201);
    const second = service.fetchMediaWithRelations(202);

    await advance(0);
    await advance(2_500);
    await advance(700);
    await Promise.all([result, second]);

    const expectedSpacing = spacing(90);
    expect(callTimes).toEqual([0, 2_500, 2_500 + expectedSpacing]);
  });

  it('waits past reset boundary when provided instead of retry-after', async () => {
    const resetAtDate = new Date(Date.now() + 1_000);
    const rateLimitResolver = createAniListResolver({
      ...withStatus(429),
      ...withHeaders({ 'X-RateLimit-Reset': resetAtDate.toUTCString(), 'X-RateLimit-Remaining': '0' }),
    });
    const successResolver = createAniListResolver();

    let callIndex = 0;
    testServer.use(
      http.post(API_URL, async (...args) => {
        callIndex += 1;
        if (callIndex === 1) {
          return rateLimitResolver(...args);
        }
        return successResolver(...args);
      }),
    );

    const service = new AnilistApiService();
    const realFetch = global.fetch;
    const callTimes: number[] = [];
    vi.spyOn(global, 'fetch').mockImplementation(async (...args) => {
      callTimes.push(Date.now());
      return realFetch(...(args as Parameters<typeof fetch>));
    });

    const promise = service.fetchMediaWithRelations(301);

    await advance(0);
    await advance(2_500);

    await promise;

    const expected = resetAtDate.getTime() + 1_500;
    expect(callTimes).toEqual([0, expected]);
  });

  it('falls back to default spacing when rate limit headers are missing', async () => {
    testServer.use(http.post(API_URL, createAniListResolver()));

    const service = new AnilistApiService();
    const realFetch = global.fetch;
    const callTimes: number[] = [];
    vi.spyOn(global, 'fetch').mockImplementation(async (...args) => {
      callTimes.push(Date.now());
      return realFetch(...(args as Parameters<typeof fetch>));
    });

    const requests = [1, 2].map(id => service.fetchMediaWithRelations(id));

    await advance(0);
    await advance(1_200);

    await Promise.all(requests);

    expect(callTimes).toEqual([0, 1_200]);
  });

  it('uses default backoff when retry-after header is malformed', async () => {
    const rateLimitResolver = createAniListResolver({
      ...withStatus(429),
      ...withHeaders({ 'Retry-After': 'bogus', 'X-RateLimit-Remaining': '0' }),
    });
    const successResolver = createAniListResolver();

    let callIndex = 0;
    testServer.use(
      http.post(API_URL, async (...args) => {
        callIndex += 1;
        if (callIndex === 1) {
          return rateLimitResolver(...args);
        }
        return successResolver(...args);
      }),
    );

    const service = new AnilistApiService();
    const realFetch = global.fetch;
    const callTimes: number[] = [];
    vi.spyOn(global, 'fetch').mockImplementation(async (...args) => {
      callTimes.push(Date.now());
      return realFetch(...(args as Parameters<typeof fetch>));
    });

    const promise = service.fetchMediaWithRelations(999);

    await advance(0);
    await advance(3_500);

    await promise;

    expect(callTimes).toEqual([0, 3_500]);
  });

  it('wraps GraphQL errors via normalizeError', async () => {
    const handler = createAniListErrorHandler('resolver failed', 500, withStatus(200));
    testServer.use(handler);

    const service = new AnilistApiService();

    const errors: unknown[] = [];
    const handled = service.fetchMediaWithRelations(301).catch(error => {
      const normalized = normalizeError(error);
      errors.push(normalized);
    });

    await handled;

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      code: ErrorCode.API_ERROR,
      message: expect.stringContaining('resolver failed'),
      userMessage: 'AniList request failed.',
    });
  });

  it('retries 5xx responses up to MAX_RETRIES and surfaces normalized metadata', async () => {
    const errorResolver = createAniListResolver({ ...withStatus(503) });
    testServer.use(http.post(API_URL, errorResolver));

    const service = new AnilistApiService();
    const errors: unknown[] = [];
    const handled = service.fetchMediaWithRelations(401).catch(error => {
      const normalized = normalizeError(error);
      errors.push(normalized);
    });

    await advance(1_000);
    await advance(2_000);
    await advance(4_000);

    await handled;

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      code: ErrorCode.API_ERROR,
      message: 'AniList API Error: 503',
      userMessage: 'AniList service is temporarily unavailable.',
      details: { status: 503 },
    });
  });
});
