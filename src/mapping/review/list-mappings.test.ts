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
  it('collapses matching manual overrides into exact upstream truth and preserves unresolved entries', async () => {
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
          listAllPairs: () => [{ anilistId: 1, tvdbId: 222 }],
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
            acceptedSource: 'auto',
            acceptedReason: 'fuzzy',
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
      source: 'upstream',
      providerId: 222,
      acceptedSource: 'upstream',
      acceptedReason: 'exact',
      resolverState: 'mapped',
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

  it('keeps manual overrides effective when they disagree with exact upstream truth', async () => {
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
              providerId: 777,
              updatedAt: 20,
            },
          ],
          isIgnored: () => false,
          getLinkedAniListIds: () => [],
        },
        upstreamMappingStore: {
          listAllPairs: () => [{ anilistId: 1, tvdbId: 555 }],
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

    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]).toMatchObject({
      anilistId: 1,
      provider: 'sonarr',
      providerId: 777,
      source: 'manual',
      acceptedSource: 'manual',
      acceptedReason: 'exact',
      resolverState: 'mapped',
      exactUpstreamProviderId: 555,
      conflictKind: 'manual-upstream-conflict',
    });
  });

  it('projects manual overrides without upstream conflicts when no exact upstream exists', async () => {
    const result = await listMappings(
      { limit: 10 },
      {
        overridesService: {
          listIgnores: () => [],
          listRejectedCandidates: () => [],
          list: () => [
            {
              anilistId: 3,
              provider: 'radarr',
              providerId: 1234,
              updatedAt: 30,
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
        resolverStateStore: createResolverStateStore(),
      },
    );

    expect(result.mappings).toHaveLength(1);
    const row = result.mappings[0];
    expect(row).toMatchObject({
      anilistId: 3,
      provider: 'radarr',
      providerId: 1234,
      source: 'manual',
      acceptedSource: 'manual',
      acceptedReason: 'exact',
      resolverState: 'mapped',
    });
    expect(row!.conflictKind).toBeUndefined();
    expect(row!.exactUpstreamProviderId).toBeNull();
  });

  it('keeps ignores effective while surfacing exact upstream conflicts', async () => {
    const result = await listMappings(
      { limit: 10 },
      {
        overridesService: {
          listIgnores: () => [
            {
              anilistId: 2,
              provider: 'sonarr',
              updatedAt: 15,
            },
          ],
          listRejectedCandidates: () => [],
          list: () => [],
          isIgnored: () => true,
          getLinkedAniListIds: () => [],
        },
        upstreamMappingStore: {
          listAllPairs: () => [{ anilistId: 2, tvdbId: 333 }],
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

    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]).toMatchObject({
      anilistId: 2,
      provider: 'sonarr',
      providerId: null,
      source: 'ignored',
      exactUpstreamProviderId: 333,
      conflictKind: 'ignore-upstream-conflict',
    });
  });

  it('does not let rejected candidates hide exact upstream truth', async () => {
    const result = await listMappings(
      { limit: 10 },
      {
        overridesService: {
          listIgnores: () => [],
          listRejectedCandidates: () => [
            {
              anilistId: 7,
              provider: 'sonarr',
              providerId: 999,
              updatedAt: 25,
            },
          ],
          list: () => [],
          isIgnored: () => false,
          getLinkedAniListIds: () => [],
        },
        upstreamMappingStore: {
          listAllPairs: () => [{ anilistId: 7, tvdbId: 444 }],
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

    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]).toMatchObject({
      anilistId: 7,
      provider: 'sonarr',
      providerId: 444,
      source: 'upstream',
      acceptedSource: 'upstream',
      acceptedReason: 'exact',
      suppressedProviderId: 999,
      suppressionKind: 'rejected-candidate',
      resolverState: 'mapped',
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
            state: 'mapped',
            providerId: 900,
            acceptedSource: 'auto',
            acceptedReason: 'fuzzy',
            updatedAt: 90,
          },
          {
            anilistId: 10,
            provider: 'radarr',
            state: 'verification-failed',
            providerId: 501,
            candidateSource: 'auto',
            candidateReason: 'relation',
            title: 'Needs Verification',
            updatedAt: 80,
          },
        ]),
      },
    );

    expect(result.mappings.find(entry => entry.anilistId === 9)).toMatchObject({
      provider: 'sonarr',
      source: 'auto',
      providerId: 900,
      acceptedSource: 'auto',
      acceptedReason: 'fuzzy',
      resolverState: 'mapped',
    });
    expect(result.mappings.find(entry => entry.anilistId === 10)).toMatchObject({
      provider: 'radarr',
      source: 'unresolved',
      resolverState: 'verification-failed',
      candidateSource: 'auto',
      candidateReason: 'relation',
      providerMeta: { title: 'Needs Verification', type: 'movie' },
    });
    expect(result.mappings.find(entry => entry.anilistId === 10)?.source).toBe('unresolved');
  });
});
