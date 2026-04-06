/** Tests for the mapping review projection and paging logic. */
// src/mapping/review/list-mappings.test.ts

import { describe, expect, it } from 'vitest';
import type { ResolverStateRecord } from '@/mapping/types';
import { listMappings } from './list-mappings';

const createResolverStateStore = (
  entries: Array<ResolverStateRecord & { anilistId: number; provider: 'sonarr' | 'radarr' }> = [],
) => ({
  list: async () => entries,
});

describe('listMappings', () => {
  it('prefers manual overrides over recorded auto mappings and preserves unresolved entries', async () => {
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
        resolverStateStore: createResolverStateStore([
          {
            anilistId: 1,
            provider: 'sonarr',
            state: 'mapped',
            providerId: 111,
            source: 'auto',
            updatedAt: 50,
          },
          {
            anilistId: 2,
            provider: 'radarr',
            state: 'unresolved',
            title: 'Missing Movie',
            updatedAt: 75,
          },
        ]),
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
        resolverStateStore: createResolverStateStore([
          {
            anilistId: 44,
            provider: 'radarr',
            state: 'unresolved',
            title: 'Needle Movie',
            updatedAt: 10,
          },
        ]),
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
        resolverStateStore: createResolverStateStore(),
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

  it('projects explicit resolver states without rebuilding them from ledgers', async () => {
    const result = await listMappings(
      { limit: 10 },
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
        resolverStateStore: createResolverStateStore([
          {
            anilistId: 9,
            provider: 'sonarr',
            state: 'ambiguous',
            title: 'Conflicted Show',
            updatedAt: 90,
          },
          {
            anilistId: 10,
            provider: 'radarr',
            state: 'verification-failed',
            providerId: 501,
            source: 'auto',
            title: 'Needs Verification',
            updatedAt: 80,
          },
        ]),
      },
    );

    expect(result.mappings.find(entry => entry.anilistId === 9)).toMatchObject({
      provider: 'sonarr',
      source: 'unresolved',
      resolverState: 'ambiguous',
      providerMeta: { title: 'Conflicted Show', type: 'series' },
    });
    expect(result.mappings.find(entry => entry.anilistId === 10)).toMatchObject({
      provider: 'radarr',
      source: 'unresolved',
      resolverState: 'verification-failed',
      providerMeta: { title: 'Needs Verification', type: 'movie' },
    });
    expect(result.mappings.find(entry => entry.anilistId === 9)?.source).toBe('unresolved');
    expect(result.mappings.find(entry => entry.anilistId === 10)?.source).toBe('unresolved');
  });
});
