import { describe, expect, it, beforeEach, vi } from 'vitest';
import { http } from 'msw';

import { AnilistApiService } from '../anilist.api';
import {
  createAniListHandlers,
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

describe('AnilistApiService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  it('deduplicates inflight requests and resolves identical promises only once', async () => {
    const [successHandler] = createAniListHandlers(withLatency(50));
    testServer.use(successHandler);

    const service = new AnilistApiService();
    const fetchSpy = vi.spyOn(global, 'fetch');

    const promiseA = service.fetchMediaWithRelations(101);
    const promiseB = service.fetchMediaWithRelations(101);

    expect(promiseA).toBe(promiseB);

    await advance(50);
    await expect(promiseA).resolves.toMatchObject({ id: expect.any(Number) });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('batches requests respecting the batch size and delay', async () => {
    const [successHandler] = createAniListHandlers();
    testServer.use(successHandler);

    const service = new AnilistApiService();
    const realFetch = global.fetch;
    const callTimes: number[] = [];
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (...args) => {
      callTimes.push(Date.now());
      return realFetch(...(args as Parameters<typeof fetch>));
    });

    const requests = [1, 2, 3, 4].map(id => service.fetchMediaWithRelations(id));

    await advance(0);
    await advance(1200);

    await Promise.all(requests);

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(callTimes.slice(0, 2)).toEqual([0, 0]);
    expect(callTimes.slice(2)).toEqual([1200, 1200]);
  });

  it('pauses the queue when hitting rate limits with varying Retry-After headers', async () => {
    const [rateLimitSecondsHandler] = createAniListHandlers({
      ...withStatus(429),
      ...withRetryAfterSeconds(2),
    });
    const [rateLimitDateHandler] = createAniListHandlers({
      ...withStatus(429),
      ...withHeaders({ 'Retry-After': new Date(Date.now() + 4_000).toUTCString() }),
    });
    const [successHandler] = createAniListHandlers();

    let callIndex = 0;
    testServer.use(
      http.post(API_URL, async (...args) => {
        callIndex += 1;
        if (callIndex === 1) {
          return rateLimitSecondsHandler.resolver(...args);
        }
        if (callIndex === 2) {
          return rateLimitDateHandler.resolver(...args);
        }
        return successHandler.resolver(...args);
      }),
    );

    const service = new AnilistApiService();
    const realFetch = global.fetch;
    const callTimes: number[] = [];
    vi.spyOn(global, 'fetch').mockImplementation(async (...args) => {
      callTimes.push(Date.now());
      return realFetch(...(args as Parameters<typeof fetch>));
    });

    const results = [service.fetchMediaWithRelations(201), service.fetchMediaWithRelations(202)];

    await advance(0);
    await advance(2_000);
    await advance(4_000);

    await Promise.all(results);

    expect(callTimes).toEqual([0, 2_000, 4_000, 4_000]);
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
    const [errorHandler] = createAniListHandlers({ ...withStatus(503) });
    testServer.use(errorHandler);

    const service = new AnilistApiService();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const errors: unknown[] = [];
    const handled = service.fetchMediaWithRelations(401).catch(error => {
      const normalized = normalizeError(error);
      errors.push(normalized);
    });

    await advance(1_000);
    await advance(2_000);

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
