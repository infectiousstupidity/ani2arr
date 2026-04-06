/** Tests for mapping inspection payload composition from stored mapping state. */
// src/mapping/inspection/get-mapping-inspection.test.ts

import { describe, expect, it, vi } from 'vitest';
import type { AniListMetadata } from '@/anilist/schemas/metadata.schema';
import type { RadarrMovieSnapshot, SonarrSeriesSnapshot } from '@/providers';
import type { ResolverStateRecord } from '@/mapping/types';
import { getMappingInspection } from './get-mapping-inspection';

const createDeps = (overrides?: {
  manualProviderId?: number | null;
  ignored?: boolean;
  rejectedCandidates?: Array<{ anilistId: number; provider: 'sonarr' | 'radarr'; providerId: number; updatedAt: number }>;
  linkedAniListIds?: number[];
  upstreamProviderId?: number | null;
  upstreamLinkedAniListIds?: number[];
  resolverState?: ResolverStateRecord | null;
  resolverStateList?: Array<ResolverStateRecord & { anilistId: number; provider: 'sonarr' | 'radarr' }>;
  linkedMetadata?: AniListMetadata[];
  sonarrLibrary?: SonarrSeriesSnapshot[];
  radarrLibrary?: RadarrMovieSnapshot[];
}) => {
  const metadataSpy = vi.fn(async () => ({ metadata: overrides?.linkedMetadata ?? [] }));

  return {
    overridesService: {
      get: vi.fn(() => overrides?.manualProviderId ?? null),
      isIgnored: vi.fn(() => overrides?.ignored ?? false),
      listRejectedCandidates: vi.fn(() => overrides?.rejectedCandidates ?? []),
      getLinkedAniListIds: vi.fn(() => overrides?.linkedAniListIds ?? []),
    },
    upstreamMappingStore: {
      get: vi.fn(() => {
        if (overrides?.upstreamProviderId == null) {
          return null;
        }
        return { tvdbId: overrides.upstreamProviderId, source: 'primary' as const };
      }),
      getAniListIdsForTvdb: vi.fn(() => overrides?.upstreamLinkedAniListIds ?? []),
    },
    resolverStateStore: {
      get: vi.fn(async () => overrides?.resolverState ?? null),
      list: vi.fn(async () => overrides?.resolverStateList ?? []),
    },
    anilistMetadataStore: {
      getMetadata: metadataSpy,
    },
    sonarrLibrary: {
      getLeanSeriesList: vi.fn(async () => overrides?.sonarrLibrary ?? []),
    },
    radarrLibrary: {
      getLeanMovieList: vi.fn(async () => overrides?.radarrLibrary ?? []),
    },
    metadataSpy,
  };
};

describe('getMappingInspection', () => {
  it('composes linked groups, explanation, and provider library context for exact upstream mappings', async () => {
    const deps = createDeps({
      upstreamProviderId: 222,
      upstreamLinkedAniListIds: [16],
      resolverStateList: [
        {
          anilistId: 15,
          provider: 'sonarr',
          state: 'mapped',
          providerId: 222,
          acceptedEvidence: {
            source: 'upstream',
            reason: 'exact-upstream',
          },
          updatedAt: 10,
        },
        {
          anilistId: 16,
          provider: 'sonarr',
          state: 'mapped',
          providerId: 222,
          acceptedEvidence: {
            source: 'auto',
            reason: 'verified-inherited',
          },
          updatedAt: 9,
        },
      ],
      linkedMetadata: [
        {
          id: 15,
          titles: { english: 'Linked Show Season 1' },
          format: 'TV',
          seasonYear: 2020,
          updatedAt: 1,
        },
        {
          id: 16,
          titles: { english: 'Linked Show Season 2' },
          format: 'TV',
          seasonYear: 2021,
          updatedAt: 1,
        },
      ],
      sonarrLibrary: [
        {
          id: 1,
          tvdbId: 222,
          title: 'Linked Show',
          titleSlug: 'linked-show',
          status: 'continuing',
          statistics: { episodeCount: 24 },
        },
      ],
    });

    const payload = await getMappingInspection({ provider: 'sonarr', anilistId: 15 }, deps);

    expect(payload.effectiveMapping).toMatchObject({
      provider: 'sonarr',
      anilistId: 15,
      providerId: 222,
      status: 'in-library',
      libraryStatus: 'in-provider',
      effectiveSource: 'upstream',
      effectiveReason: 'exact-upstream',
      library: {
        status: 'in-provider',
        title: 'Linked Show',
        type: 'series',
        statusLabel: 'continuing',
        inLibraryCount: 24,
      },
    });
    expect(payload.providerContext).toEqual({
      provider: 'sonarr',
      providerId: 222,
      linkedAniListIds: [15, 16],
      linkedAniListCount: 2,
    });
    expect(payload.linkedAniListEntries).toEqual([
      { anilistId: 15, title: 'Linked Show Season 1', format: 'TV', year: 2020, relation: 'current' },
      { anilistId: 16, title: 'Linked Show Season 2', format: 'TV', year: 2021 },
    ]);
    expect(payload.whyThisExists).toContainEqual(
      expect.objectContaining({
        kind: 'effective-source',
        summary: 'Exact upstream mapping is currently effective.',
        source: 'upstream',
        reason: 'exact-upstream',
      }),
    );
    expect(deps.metadataSpy).toHaveBeenCalledWith([15, 16], expect.objectContaining({
      refreshStale: false,
      fetchMissing: false,
    }));
  });

  it('projects suggested candidates from recent evaluation traces without requiring a new resolution run', async () => {
    const deps = createDeps({
      resolverState: {
        state: 'mapped',
        providerId: 900,
        acceptedEvidence: {
          source: 'auto',
          reason: 'fuzzy-match',
          successfulTitle: 'Auto Candidate',
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
            {
              providerId: 901,
              title: 'Wrong Match',
              source: 'auto',
              reason: 'fuzzy-match',
              status: 'rejected',
              summary: 'Fuzzy title match rejected by candidate suppression',
              score: 0.6,
            },
            {
              providerId: 902,
              title: 'Suppressed Match',
              source: 'auto',
              reason: 'verified-inherited',
              status: 'suppressed',
              summary: 'Inherited candidate suppressed',
            },
            {
              providerId: 903,
              title: 'Runner Up',
              source: 'auto',
              reason: 'exact-title-match',
              status: 'not-accepted',
              summary: 'Exact title match not accepted',
              score: 0.72,
            },
          ],
        },
        updatedAt: 90,
      },
    });

    const payload = await getMappingInspection({ provider: 'radarr', anilistId: 10 }, deps);

    expect(payload.suggestedCandidates).toMatchObject({
      attemptedAt: 90,
      searchTerms: ['Auto Candidate'],
      accepted: [expect.objectContaining({ providerId: 900, status: 'accepted' })],
      rejected: [expect.objectContaining({ providerId: 901, status: 'rejected' })],
      suppressed: [expect.objectContaining({ providerId: 902, status: 'suppressed' })],
      notAccepted: [expect.objectContaining({ providerId: 903, status: 'not-accepted' })],
    });
    expect(payload.whyThisExists).toContainEqual(
      expect.objectContaining({
        kind: 'effective-source',
        summary: 'Fuzzy fallback match is currently effective.',
        source: 'auto',
        reason: 'fuzzy-match',
        details: ['Matched with title "Auto Candidate".'],
      }),
    );
  });

  it('preserves rejected-candidate suppression on mapped resolver-state inspection payloads', async () => {
    const deps = createDeps({
      rejectedCandidates: [
        {
          anilistId: 11,
          provider: 'sonarr',
          providerId: 901,
          updatedAt: 95,
        },
      ],
      resolverState: {
        state: 'mapped',
        providerId: 900,
        acceptedEvidence: {
          source: 'auto',
          reason: 'fuzzy-match',
        },
        updatedAt: 90,
      },
    });

    const payload = await getMappingInspection({ provider: 'sonarr', anilistId: 11 }, deps);

    expect(payload.effectiveMapping).toMatchObject({
      provider: 'sonarr',
      anilistId: 11,
      providerId: 900,
      suppressedProviderId: 901,
      suppressionKind: 'rejected-candidate',
      status: 'can-add',
      libraryStatus: 'not-in-provider',
      effectiveSource: 'auto',
      effectiveReason: 'fuzzy-match',
      resolverOutcome: 'mapped',
    });
    expect(payload.review).toEqual({
      needsReview: false,
      summary: undefined,
      items: undefined,
    });
    expect(payload.whyThisExists).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'effective-source',
          summary: 'Fuzzy fallback match is currently effective.',
        }),
        expect.objectContaining({
          kind: 'suppression',
          summary: 'Candidate 901 was rejected for this AniList entry.',
          suppressedProviderId: 901,
        }),
      ]),
    );
  });

  it('surfaces review detail and explanation for manual upstream disagreements', async () => {
    const deps = createDeps({
      manualProviderId: 777,
      upstreamProviderId: 555,
    });

    const payload = await getMappingInspection({ provider: 'sonarr', anilistId: 1 }, deps);

    expect(payload.effectiveMapping).toMatchObject({
      providerId: 777,
      status: 'needs-review',
      effectiveSource: 'manual',
      effectiveReason: 'manual-override',
    });
    expect(payload.review).toMatchObject({
      needsReview: true,
      summary: {
        count: 1,
        primaryReason: 'manual-upstream-disagreement',
        reasons: ['manual-upstream-disagreement'],
      },
      items: [
        expect.objectContaining({
          reason: 'manual-upstream-disagreement',
          proposed: expect.objectContaining({ providerId: 555 }),
        }),
      ],
    });
    expect(payload.whyThisExists).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'effective-source',
          summary: 'Manual mapping override is currently effective.',
        }),
        expect.objectContaining({
          kind: 'review',
          reviewReason: 'manual-upstream-disagreement',
        }),
      ]),
    );
  });

  it('returns a cheap unresolved detail payload when no mapping state exists yet', async () => {
    const deps = createDeps();

    const payload = await getMappingInspection({ provider: 'radarr', anilistId: 404 }, deps);

    expect(payload).toMatchObject({
      effectiveMapping: {
        provider: 'radarr',
        anilistId: 404,
        providerId: null,
        status: 'unresolved',
        libraryStatus: 'unmapped',
      },
      providerContext: {
        provider: 'radarr',
        providerId: null,
        linkedAniListIds: [],
        linkedAniListCount: 0,
      },
      linkedAniListEntries: [],
      suggestedCandidates: {
        accepted: [],
        rejected: [],
        suppressed: [],
        notAccepted: [],
      },
      review: {
        needsReview: false,
      },
    });
    expect(payload.whyThisExists).toEqual([
      {
        kind: 'resolver-outcome',
        summary: 'No effective mapping is currently stored for this AniList entry.',
      },
    ]);
    expect(deps.metadataSpy).not.toHaveBeenCalled();
  });
});
