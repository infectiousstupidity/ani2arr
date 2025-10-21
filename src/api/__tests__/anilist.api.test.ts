import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from 'msw';

import { createAniListResolver, createAniMediaFixture, testServer, withHeaders, withStatus } from '@/testing';
import type { AniMedia } from '@/types';
import { ErrorCode, normalizeError } from '@/utils/error-handling';

const API_URL = 'https://graphql.anilist.co';

const advance = async (ms: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

let AnilistApiService: typeof import('../anilist.api').AnilistApiService;

describe('AnilistApiService', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.resetModules();
    ({ AnilistApiService } = await import('../anilist.api'));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('fetches media payloads via the queue', async () => {
    const media = createAniMediaFixture({ id: 777 });
    testServer.use(http.post(API_URL, createAniListResolver({ media })));

    const service = new AnilistApiService();
    const result = await service.fetchMediaWithRelations(777);

    expect(result).toMatchObject({ id: 777, title: media.title });
  });

  it('retries 5xx responses up to MAX_RETRIES with exponential delay', async () => {
    const setTimeoutSpy = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation(((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => {
        queueMicrotask(() => {
          if (typeof handler === 'function') {
            handler(...args);
          }
        });
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as unknown as typeof setTimeout);
    const clearTimeoutSpy = vi
      .spyOn(globalThis, 'clearTimeout')
      .mockImplementation((() => {}) as unknown as typeof clearTimeout);

    const resolver = createAniListResolver({ ...withStatus(503) });
    testServer.use(http.post(API_URL, resolver));

    const service = new AnilistApiService();
    try {
      const promise = service.fetchMediaWithRelations(101).catch(error => normalizeError(error));
      const error = await promise;

      expect(error).toMatchObject({
        code: ErrorCode.API_ERROR,
        message: 'AniList API Error: 503',
        userMessage: 'AniList service is temporarily unavailable.',
        details: { status: 503 },
      });
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    }
  }, 15_000);

  it('applies retry-after header before retrying after a 429', async () => {
    const rateLimited = createAniListResolver({
      ...withStatus(429),
      headers: { 'Retry-After': '1', 'X-RateLimit-Remaining': '0' },
    });
    const success = createAniListResolver({
      media: createAniMediaFixture({ id: 202 }),
      ...withHeaders({ 'X-RateLimit-Limit': '90', 'X-RateLimit-Remaining': '89' }),
    });

    const callTimes: number[] = [];
    let call = 0;
    testServer.use(
      http.post(API_URL, async (...args) => {
        callTimes.push(Date.now());
        call += 1;
        return call === 1 ? rateLimited(...args) : success(...args);
      }),
    );

    const service = new AnilistApiService();
    const promise = service.fetchMediaWithRelations(202);

    await advance(0);
    await advance(1_000);
    await advance(0);
    await promise;

    expect(callTimes).toEqual([0, 1_000]);
  });

  it('traverses prequel chain lazily by issuing follow-up requests', async () => {
    const root = createAniMediaFixture({
      id: 900,
      relations: {
        edges: [
          {
            relationType: 'PREQUEL',
            node: createAniMediaFixture({ id: 901, relations: { edges: [] }, synonyms: [] }),
          },
        ],
      },
    });

    const prequel = createAniMediaFixture({
      id: 901,
      relations: {
        edges: [
          {
            relationType: 'PREQUEL',
            node: createAniMediaFixture({ id: 902, relations: { edges: [] }, synonyms: [] }),
          },
        ],
      },
    });

    const secondPrequel = createAniMediaFixture({
      id: 902,
      relations: { edges: [] },
    });

    testServer.use(
      http.post(API_URL, async ({ request }) => {
        const body = (await request.json()) as { variables?: { id?: number } };
        const id = body.variables?.id;
        if (id === 900) {
          return createAniListResolver({ media: root })({ request } as never);
        }
        if (id === 901) {
          return createAniListResolver({ media: prequel })({ request } as never);
        }
        if (id === 902) {
          return createAniListResolver({ media: secondPrequel })({ request } as never);
        }
        throw new Error(`unexpected AniList request for id=${String(id)}`);
      }),
    );

    const service = new AnilistApiService();
    const rootMedia = await service.fetchMediaWithRelations(900);

    const collected: number[] = [];
    for await (const media of service.iteratePrequelChain(rootMedia)) {
      collected.push(media.id);
    }

    expect(collected).toEqual([901, 902]);
  });

  it('deduplicates inflight fetches and writes through the cache', async () => {
    const media = createAniMediaFixture({ id: 404 });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { Media: media } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const cache = {
      read: vi.fn().mockResolvedValue(null),
      write: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn(),
      clear: vi.fn(),
    };

    const service = new AnilistApiService({ media: cache });
    const [first, second] = await Promise.all([
      service.fetchMediaWithRelations(404),
      service.fetchMediaWithRelations(404),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ id: 404 });
    expect(second).toMatchObject({ id: 404 });
    expect(cache.write).toHaveBeenCalledWith(
      '404',
      expect.objectContaining({ id: 404 }),
      expect.objectContaining({
        staleMs: expect.any(Number),
        hardMs: expect.any(Number),
        meta: expect.objectContaining({ cachedAt: expect.any(Number) }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it('returns stale cached media immediately while scheduling a background refresh', async () => {
    const cachedMedia = createAniMediaFixture({ id: 505 });
    const freshMedia = createAniMediaFixture({ id: 505, title: { ...cachedMedia.title, romaji: 'Fresh Title' } });

    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { Media: freshMedia } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const cache = {
      read: vi.fn().mockResolvedValue({
        value: cachedMedia,
        stale: true,
        staleAt: 0,
        expiresAt: 1_000_000,
      }),
      write: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn(),
      clear: vi.fn(),
    };

    const service = new AnilistApiService({ media: cache });
    const result = await service.fetchMediaWithRelations(505);

    expect(result).toBe(cachedMedia);

    const inflightPromise = (service as unknown as { inflight: Map<number, Promise<AniMedia>> }).inflight.get(505);
    expect(inflightPromise).toBeInstanceOf(Promise);
    await inflightPromise;

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(cache.write).toHaveBeenCalledWith(
      '505',
      freshMedia,
      expect.objectContaining({ staleMs: expect.any(Number), hardMs: expect.any(Number) }),
    );

    vi.unstubAllGlobals();
  });

  it('aggregates GraphQL errors when payload lacks media', async () => {
    testServer.use(
      http.post(API_URL, () =>
        Response.json({
          data: { Media: null },
          errors: [
            { message: 'first', status: 400 },
            { message: 'second', status: 400 },
          ],
        }),
      ),
    );

    const service = new AnilistApiService();
    await expect(service.fetchMediaWithRelations(999)).rejects.toMatchObject({
      message: 'AniList GraphQL Error: first, second',
    });
  });

  it('raises API errors for non-retriable client responses', async () => {
    testServer.use(http.post(API_URL, createAniListResolver({ ...withStatus(400) })));

    const service = new AnilistApiService();
    await expect(service.fetchMediaWithRelations(321)).rejects.toMatchObject({
      code: ErrorCode.API_ERROR,
      message: 'AniList API Error: 400',
      details: { status: 400 },
    });
  });

  it('throws when AniList response omits media without errors', async () => {
    testServer.use(http.post(API_URL, () => Response.json({ data: { Media: undefined } })));

    const service = new AnilistApiService();
    await expect(service.fetchMediaWithRelations(123)).rejects.toMatchObject({
      message: 'AniList response missing media for 123',
    });
  });

  it('supports includeRoot and maxDepth options when iterating prequels', async () => {
    const root = createAniMediaFixture({
      id: 300,
      relations: {
        edges: [
          { relationType: 'PREQUEL', node: createAniMediaFixture({ id: 301, relations: { edges: [] } }) },
        ],
      },
    });
    const prequel = createAniMediaFixture({
      id: 301,
      relations: {
        edges: [
          { relationType: 'PREQUEL', node: createAniMediaFixture({ id: 302, relations: { edges: [] } }) },
        ],
      },
    });
    const secondPrequel = createAniMediaFixture({ id: 302, relations: { edges: [] } });

    testServer.use(
      http.post(API_URL, async ({ request }) => {
        const body = (await request.json()) as { variables?: { id?: number } };
        const id = body.variables?.id;
        if (id === 300) {
          return Response.json({ data: { Media: root } });
        }
        if (id === 301) {
          return Response.json({ data: { Media: prequel } });
        }
        if (id === 302) {
          return Response.json({ data: { Media: secondPrequel } });
        }
        throw new Error(`unexpected AniList request for id=${String(id)}`);
      }),
    );

    const service = new AnilistApiService();
    const seen: number[] = [];
    for await (const media of service.iteratePrequelChain(root, { includeRoot: true, maxDepth: 1 })) {
      seen.push(media.id);
    }
    expect(seen).toEqual([300, 301]);
  });


  it('parses retry-after headers with multiple formats', () => {
    const service = new AnilistApiService();
    const internals = service as unknown as {
      parseRetryAfterTs: (value: string | null) => number | null;
    };

    vi.setSystemTime(1_000);
    const baseNow = Date.now();
    expect(internals.parseRetryAfterTs('10')).toBe(baseNow + 10_000);

    const future = new Date(baseNow + 5_000).toUTCString();
    expect(internals.parseRetryAfterTs(future)).toBeGreaterThanOrEqual(baseNow);

    expect(internals.parseRetryAfterTs('not-a-date')).toBeNull();
  });

  it('removes cached media entries gracefully', async () => {
    const cache = {
      read: vi.fn(),
      write: vi.fn(),
      remove: vi.fn().mockRejectedValue(new Error('boom')),
      clear: vi.fn(),
    };
    const service = new AnilistApiService({ media: cache });
    await expect(service.removeMediaFromCache(77)).resolves.toBeUndefined();
    expect(cache.remove).toHaveBeenCalledWith('77');

    const noCacheService = new AnilistApiService();
    await expect(noCacheService.removeMediaFromCache(42)).resolves.toBeUndefined();
  });
});
