/** Tests for pipeline match reasons on exact and fuzzy title wins. */
// src/mapping/pipeline/pipeline.test.ts

import { describe, expect, it, vi } from 'vitest';
import type { AniListMedia } from './types';
import { resolveViaPipeline } from './pipeline';
import type { ProviderLookupClient, ProviderLookupResult } from '../lookup';

type SonarrLookupResult = ProviderLookupResult & { tvdbId: number };

const createLookupClient = (
  results: SonarrLookupResult[],
): ProviderLookupClient<unknown, SonarrLookupResult> => ({
  provider: 'sonarr',
  reset: async () => {},
  readFromCache: async () => ({ results: [], hit: 'none' }),
  lookup: async () => results,
  getProviderId: (result: unknown) =>
    typeof (result as Partial<SonarrLookupResult>).tvdbId === 'number'
      ? (result as SonarrLookupResult).tvdbId
      : null,
});

const createMedia = (title: string, year = 2013): AniListMedia => ({
  id: 1,
  format: 'TV',
  title: { english: title },
  synonyms: [],
  startDate: { year },
} as AniListMedia);

const TEST_CREDENTIALS = {
  url: 'http://localhost:8989',
  apiKey: 'test-key',
};

describe('resolveViaPipeline', () => {
  it('returns exact when the winning candidate is an exact title match', async () => {
    const result = await resolveViaPipeline(
      createMedia('Attack on Titan'),
      {
        anilistApi: {} as never,
        lookupClient: createLookupClient([{ title: 'Attack on Titan', tvdbId: 101, year: 2013 }]),
        upstreamMappingStore: {} as never,
        credentials: TEST_CREDENTIALS,
        sessionSeenCanonical: new Set<string>(),
        limits: {
          maxTerms: 1,
          scoreThreshold: 0.1,
          earlyStopThreshold: 2,
        },
        log: { debug: vi.fn() } as never,
      },
    );

    expect(result).toMatchObject({
      status: 'resolved',
      providerId: 101,
      reason: 'exact',
    });
  });

  it('returns fuzzy when the winning candidate only matches approximately', async () => {
    const result = await resolveViaPipeline(
      createMedia('Attack on Titan'),
      {
        anilistApi: {} as never,
        lookupClient: createLookupClient([{ title: 'Attack Titan', tvdbId: 202, year: 2013 }]),
        upstreamMappingStore: {} as never,
        credentials: TEST_CREDENTIALS,
        sessionSeenCanonical: new Set<string>(),
        limits: {
          maxTerms: 1,
          scoreThreshold: 0.01,
          earlyStopThreshold: 2,
        },
        log: { debug: vi.fn() } as never,
      },
    );

    expect(result).toMatchObject({
      status: 'resolved',
      providerId: 202,
      reason: 'fuzzy',
    });
  });
});