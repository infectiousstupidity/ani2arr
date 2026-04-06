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
            acceptedEvidence: {
              source: 'auto',
              reason: 'fuzzy-match',
            },
            updatedAt: 50,
          },
          {
            anilistId: 2,
            provider: 'radarr',
            state: 'unresolved',
            recentEvaluation: {
              attemptedAt: 75,
              searchTerms: ['Missing Movie'],
              candidates: [],
            },
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
      acceptedEvidence: {
        source: 'upstream',
        reason: 'exact-upstream',
      },
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
            recentEvaluation: {
              attemptedAt: 10,
              searchTerms: ['Needle Movie'],
              candidates: [],
            },
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
      acceptedEvidence: {
        source: 'manual',
        reason: 'manual-override',
      },
      resolverState: 'mapped',
      reviewSummary: {
        count: 1,
        primaryReason: 'manual-upstream-disagreement',
        reasons: ['manual-upstream-disagreement'],
      },
      reviewItems: [
        expect.objectContaining({
          reason: 'manual-upstream-disagreement',
          current: expect.objectContaining({
            source: 'manual',
            providerId: 777,
            acceptedReason: 'manual-override',
          }),
          proposed: expect.objectContaining({
            source: 'upstream',
            providerId: 555,
            acceptedReason: 'exact-upstream',
          }),
        }),
      ],
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
      acceptedEvidence: {
        source: 'manual',
        reason: 'manual-override',
      },
      resolverState: 'mapped',
    });
    expect(row!.reviewSummary).toBeUndefined();
    expect(row!.reviewItems).toBeUndefined();
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
      reviewSummary: {
        count: 1,
        primaryReason: 'ignored-but-exact-upstream',
        reasons: ['ignored-but-exact-upstream'],
      },
      reviewItems: [
        expect.objectContaining({
          reason: 'ignored-but-exact-upstream',
          current: expect.objectContaining({
            source: 'ignored',
            providerId: null,
          }),
          proposed: expect.objectContaining({
            source: 'upstream',
            providerId: 333,
            acceptedReason: 'exact-upstream',
          }),
        }),
      ],
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
      acceptedEvidence: {
        source: 'upstream',
        reason: 'exact-upstream',
      },
      suppressedProviderId: 999,
      suppressionKind: 'rejected-candidate',
      resolverState: 'mapped',
    });
  });

  it('projects verification-failed inherited review without changing the unresolved effective state', async () => {
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
            acceptedEvidence: {
              source: 'auto',
              reason: 'fuzzy-match',
            },
            recentEvaluation: {
              attemptedAt: 90,
              searchTerms: ['Auto Candidate'],
              candidates: [
                {
                  providerId: 900,
                  title: 'Auto Candidate',
                  source: 'auto',
                  reason: 'fuzzy-match',
                  status: 'accepted',
                  summary: 'Fuzzy title match',
                  score: 0.81,
                },
              ],
            },
            updatedAt: 90,
          },
          {
            anilistId: 10,
            provider: 'radarr',
            state: 'verification-failed',
            recentEvaluation: {
              attemptedAt: 80,
              searchTerms: ['Needs Verification'],
              candidates: [
                {
                  providerId: 501,
                  title: 'Needs Verification',
                  source: 'auto',
                  reason: 'verified-inherited',
                  status: 'suppressed',
                  summary: 'Inherited from related AniList mapping suppressed',
                  score: 0.9,
                },
              ],
            },
            updatedAt: 80,
          },
        ]),
      },
    );

    expect(result.mappings.find(entry => entry.anilistId === 9)).toMatchObject({
      provider: 'sonarr',
      source: 'auto',
      providerId: 900,
      acceptedEvidence: {
        source: 'auto',
        reason: 'fuzzy-match',
      },
      resolverState: 'mapped',
    });
    expect(result.mappings.find(entry => entry.anilistId === 10)).toMatchObject({
      provider: 'radarr',
      source: 'unresolved',
      resolverState: 'verification-failed',
      reviewSummary: {
        count: 1,
        primaryReason: 'verification-failed-inherited-candidate',
        reasons: ['verification-failed-inherited-candidate'],
      },
      reviewItems: [
        expect.objectContaining({
          reason: 'verification-failed-inherited-candidate',
          current: expect.objectContaining({
            source: 'unresolved',
            providerId: null,
            resolverState: 'verification-failed',
          }),
          proposed: expect.objectContaining({
            source: 'auto',
            providerId: 501,
            acceptedReason: 'verified-inherited',
          }),
        }),
      ],
      recentEvaluation: {
        attemptedAt: 80,
        searchTerms: ['Needs Verification'],
        candidates: [
          expect.objectContaining({
            providerId: 501,
            reason: 'verified-inherited',
            status: 'suppressed',
          }),
        ],
      },
      providerMeta: { title: 'Needs Verification', type: 'movie' },
    });
    expect(result.mappings.find(entry => entry.anilistId === 10)?.source).toBe('unresolved');
  });

  it('projects ambiguous inherited conflicts as review items instead of hiding them in unresolved traces', async () => {
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
            anilistId: 12,
            provider: 'sonarr',
            state: 'ambiguous',
            recentEvaluation: {
              attemptedAt: 120,
              candidates: [
                {
                  providerId: 701,
                  title: 'Anchor A',
                  source: 'auto',
                  reason: 'verified-inherited',
                  status: 'not-accepted',
                  summary: 'Inherited candidate ambiguous: conflicting trusted relation anchors proposed different provider IDs.',
                  inheritedVerification: {
                    reason: 'Conflicting trusted relation anchors proposed different provider IDs.',
                    positiveSignals: [],
                    contradictions: [],
                    immediateSourceAniListId: 11,
                    chainAnchorAniListId: 10,
                  },
                },
                {
                  providerId: 702,
                  title: 'Anchor B',
                  source: 'auto',
                  reason: 'verified-inherited',
                  status: 'not-accepted',
                  summary: 'Inherited candidate ambiguous: conflicting trusted relation anchors proposed different provider IDs.',
                  inheritedVerification: {
                    reason: 'Conflicting trusted relation anchors proposed different provider IDs.',
                    positiveSignals: [],
                    contradictions: [],
                    immediateSourceAniListId: 9,
                    chainAnchorAniListId: 8,
                  },
                },
              ],
            },
            updatedAt: 120,
          },
        ]),
      },
    );

    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]).toMatchObject({
      anilistId: 12,
      provider: 'sonarr',
      providerId: null,
      source: 'unresolved',
      resolverState: 'ambiguous',
      reviewSummary: {
        count: 1,
        primaryReason: 'ambiguous-inherited-conflict',
        reasons: ['ambiguous-inherited-conflict'],
      },
      reviewItems: [
        expect.objectContaining({
          reason: 'ambiguous-inherited-conflict',
          current: expect.objectContaining({
            source: 'unresolved',
            providerId: null,
            resolverState: 'ambiguous',
          }),
          conflicts: [
            expect.objectContaining({ source: 'auto', providerId: 701, acceptedReason: 'verified-inherited' }),
            expect.objectContaining({ source: 'auto', providerId: 702, acceptedReason: 'verified-inherited' }),
          ],
        }),
      ],
    });
  });
});
