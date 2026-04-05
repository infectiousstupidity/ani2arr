/** Focused tests for AniList batch media transport parsing and mapping. */
// src/anilist/transport/media.test.ts

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AniListResponseMeta } from '@/anilist/transport/types';

const { postAniListMock } = vi.hoisted(() => ({
  postAniListMock: vi.fn(),
}));

vi.mock('@/anilist/transport/request', () => ({
  postAniList: postAniListMock,
}));

import { fetchAniListMediaBatch } from './media';

const META: AniListResponseMeta = {
  status: 200,
  headers: {},
  rateLimit: {
    limit: null,
    remaining: null,
    resetAt: null,
    retryAfterMs: null,
  },
  receivedAt: 0,
};

afterEach(() => {
  postAniListMock.mockReset();
});

describe('AniList batch media transport', () => {
  it('maps raw nullable title leaves and null title objects into canonical titles', async () => {
    postAniListMock.mockResolvedValue({
      payload: {
        data: {
          Page: {
            media: [
              {
                id: 101,
                format: 'TV',
                title: { romaji: 'Alpha', english: null, native: 'アルファ' },
              },
              {
                id: 102,
                format: 'MOVIE',
                title: null,
              },
            ],
          },
        },
      },
      meta: META,
    });

    const result = await fetchAniListMediaBatch([101, 102]);

    expect(result.data).toEqual([
      {
        id: 101,
        format: 'TV',
        title: { romaji: 'Alpha', native: 'アルファ' },
        synonyms: [],
      },
      {
        id: 102,
        format: 'MOVIE',
        title: {},
        synonyms: [],
      },
    ]);
    expect(result.meta).toBe(META);
  });

  it('returns only valid items from a mixed batch', async () => {
    postAniListMock.mockResolvedValue({
      payload: {
        data: {
          Page: {
            media: [
              {
                id: 201,
                format: 'TV',
                title: { romaji: 'Valid' },
              },
              {
                id: 202,
                format: 'TV',
                title: { english: 123 },
              },
            ],
          },
        },
      },
      meta: META,
    });

    const result = await fetchAniListMediaBatch([201, 202]);

    expect(result.data).toEqual([
      {
        id: 201,
        format: 'TV',
        title: { romaji: 'Valid' },
        synonyms: [],
      },
    ]);
  });

  it('throws GraphQL envelope errors unchanged', async () => {
    postAniListMock.mockResolvedValue({
      payload: {
        errors: [{ message: 'AniList exploded', status: 500 }],
      },
      meta: META,
    });

    await expect(fetchAniListMediaBatch([301])).rejects.toThrow('AniList GraphQL Error: AniList exploded');
  });

  it('fails fast for malformed response envelopes', async () => {
    postAniListMock.mockResolvedValue({
      payload: {
        data: {
          Page: {
            media: 'not-an-array',
          },
        },
      },
      meta: META,
    });

    await expect(fetchAniListMediaBatch([401])).rejects.toThrow();
  });

  it('drops null and invalid relation edges instead of failing the item', async () => {
    postAniListMock.mockResolvedValue({
      payload: {
        data: {
          Page: {
            media: [
              {
                id: 501,
                format: 'TV',
                title: { romaji: 'Test' },
                relations: {
                  edges: [
                    null,
                    { relationType: null, node: { id: 10 } },
                    { relationType: 'SEQUEL', node: { id: null } },
                    { relationType: 'PREQUEL', node: { id: 0 } },
                    { relationType: 'SEQUEL', node: { id: 200 } },
                  ],
                },
              },
            ],
          },
        },
      },
      meta: META,
    });

    const result = await fetchAniListMediaBatch([501]);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.relations).toEqual({
      edges: [{ relationType: 'SEQUEL', node: { id: 200 } }],
    });
  });

  it('drops nextAiringEpisode with null leaves instead of failing the item', async () => {
    postAniListMock.mockResolvedValue({
      payload: {
        data: {
          Page: {
            media: [
              {
                id: 601,
                format: 'TV',
                title: { romaji: 'Airing' },
                nextAiringEpisode: { episode: 5, airingAt: null },
              },
            ],
          },
        },
      },
      meta: META,
    });

    const result = await fetchAniListMediaBatch([601]);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.nextAiringEpisode).toBeNull();
  });

  it('coerces unknown enum values to null instead of dropping the item', async () => {
    postAniListMock.mockResolvedValue({
      payload: {
        data: {
          Page: {
            media: [
              {
                id: 701,
                format: 'BRAND_NEW_FORMAT',
                status: 'UNKNOWN_STATUS',
                season: 'MONSOON',
                title: { romaji: 'Future Show' },
              },
            ],
          },
        },
      },
      meta: META,
    });

    const result = await fetchAniListMediaBatch([701]);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.format).toBeNull();
    expect(result.data[0]!.status).toBeNull();
    expect(result.data[0]!.season).toBeNull();
  });

  it('drops invalid synonyms and genres entries instead of dropping the item', async () => {
    postAniListMock.mockResolvedValue({
      payload: {
        data: {
          Page: {
            media: [
              {
                id: 801,
                format: 'TV',
                title: { romaji: 'Filtered Arrays' },
                synonyms: ['Alpha', null, 123, 'Beta'],
                genres: ['Action', false, 'Drama'],
              },
            ],
          },
        },
      },
      meta: META,
    });

    const result = await fetchAniListMediaBatch([801]);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.synonyms).toEqual(['Alpha', 'Beta']);
    expect(result.data[0]!.genres).toEqual(['Action', 'Drama']);
  });

  it('drops an item with a null id', async () => {
    postAniListMock.mockResolvedValue({
      payload: {
        data: {
          Page: {
            media: [
              {
                id: null,
                format: 'TV',
                title: { romaji: 'No ID' },
              },
            ],
          },
        },
      },
      meta: META,
    });

    const result = await fetchAniListMediaBatch([]);
    expect(result.data).toHaveLength(0);
  });
});
