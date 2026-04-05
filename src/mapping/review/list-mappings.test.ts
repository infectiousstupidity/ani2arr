/** Tests for the mapping review projection and paging logic. */
// src/mapping/review/list-mappings.test.ts

import { beforeEach, describe, expect, it } from 'vitest';
import { resolvedLedger } from '@/mapping/ledger/resolved-ledger';
import { unresolvedLedger } from '@/mapping/ledger/unresolved-ledger';
import { listMappings } from './list-mappings';

describe('listMappings', () => {
  beforeEach(() => {
    resolvedLedger.clear();
    unresolvedLedger.clear();
  });

  it('prefers manual overrides over recorded auto mappings and preserves unresolved entries', async () => {
    resolvedLedger.record('sonarr', 1, { providerId: 111 }, 'auto');
    unresolvedLedger.record('radarr', 2, 'Missing Movie');

    const result = await listMappings(
      { limit: 10 },
      {
        overridesService: {
          listIgnores: () => [],
          listRejectedCandidates: () => [],
          list: () => [
            {
              anilistId: 1,
              provider: 'sonarr',
              providerId: 222,
              updatedAt: 100,
            },
          ],
          isIgnored: () => false,
          getLinkedAniListIds: () => [],
        },
        upstreamMappingStore: {
          listAllPairs: () => [],
          getAniListIdsForTvdb: () => [],
        },
        sonarrLibrary: {
          getLeanSeriesList: async () => [],
        },
        radarrLibrary: {
          getLeanMovieList: async () => [],
        },
      },
    );

    expect(result.total).toBe(2);
    expect(result.mappings.find(entry => entry.anilistId === 1)).toMatchObject({
      provider: 'sonarr',
      source: 'manual',
      providerId: 222,
    });
    expect(result.mappings.find(entry => entry.anilistId === 2)).toMatchObject({
      provider: 'radarr',
      source: 'unresolved',
      providerMeta: { title: 'Missing Movie', type: 'movie' },
    });
  });

  it('matches unresolved entries by their captured title query', async () => {
    unresolvedLedger.record('radarr', 44, 'Needle Movie');

    const result = await listMappings(
      { limit: 10, query: 'needle' },
      {
        overridesService: {
          listIgnores: () => [],
          listRejectedCandidates: () => [],
          list: () => [],
          isIgnored: () => false,
          getLinkedAniListIds: () => [],
        },
        upstreamMappingStore: {
          listAllPairs: () => [],
          getAniListIdsForTvdb: () => [],
        },
        sonarrLibrary: {
          getLeanSeriesList: async () => [],
        },
        radarrLibrary: {
          getLeanMovieList: async () => [],
        },
      },
    );

    expect(result.total).toBe(1);
    expect(result.mappings[0]).toMatchObject({
      anilistId: 44,
      provider: 'radarr',
      source: 'unresolved',
      providerMeta: { title: 'Needle Movie', type: 'movie' },
    });
  });

  it('treats suppressed rows as rejected and ignored only', async () => {
    const result = await listMappings(
      { limit: 10, sources: ['rejected', 'ignored'] },
      {
        overridesService: {
          listIgnores: () => [
            {
              anilistId: 2,
              provider: 'radarr',
              updatedAt: 15,
            },
          ],
          listRejectedCandidates: () => [
            {
              anilistId: 1,
              provider: 'sonarr',
              providerId: 777,
              updatedAt: 20,
            },
          ],
          list: () => [],
          isIgnored: () => false,
          getLinkedAniListIds: () => [],
        },
        upstreamMappingStore: {
          listAllPairs: () => [],
          getAniListIdsForTvdb: () => [],
        },
        sonarrLibrary: {
          getLeanSeriesList: async () => [],
        },
        radarrLibrary: {
          getLeanMovieList: async () => [],
        },
      },
    );

    expect(result.mappings).toHaveLength(2);
    expect(result.mappings.map(entry => entry.source).toSorted()).toEqual(['ignored', 'rejected']);
    expect(result.mappings.find(entry => entry.source === 'rejected')).toMatchObject({
      anilistId: 1,
      provider: 'sonarr',
      providerId: null,
      suppressedProviderId: 777,
    });
  });
});
