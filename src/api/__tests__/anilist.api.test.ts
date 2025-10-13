import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { http } from 'msw';

import { AnilistApiService } from '../anilist.api';
import { createAniListResolver, createAniMediaFixture, testServer, withHeaders, withStatus } from '@/testing';
import { ErrorCode, normalizeError } from '@/utils/error-handling';

const API_URL = 'https://graphql.anilist.co';

const advance = async (ms: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

describe('AnilistApiService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
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
    const resolver = createAniListResolver({ ...withStatus(503) });
    testServer.use(http.post(API_URL, resolver));

    const service = new AnilistApiService();
    const promise = service.fetchMediaWithRelations(101).catch(error => normalizeError(error));

    await advance(1_000);
    await advance(2_000);
    await advance(4_000);
    const error = await promise;

    expect(error).toMatchObject({
      code: ErrorCode.API_ERROR,
      message: 'AniList API Error: 503',
      userMessage: 'AniList service is temporarily unavailable.',
      details: { status: 503 },
    });
  });

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
    await advance(2_500);
    await advance(0);
    await promise;

    expect(callTimes).toEqual([0, 2_500]);
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
});
