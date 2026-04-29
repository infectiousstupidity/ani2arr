import { describe, expect, it } from 'vitest';
import { parseAniListId, type AniListId } from '@/anilist';
import { parseTmdbId, parseTvdbId } from '@/providers';
import type { AnibridgeProviderPair } from '@/mapping/upstream';
import type { AutoMappingRecord } from '@/mapping/auto-mapping/types';
import { getMappingIdentities, type GetMappingIdentitiesDeps } from './mapping-identities';

const aid = parseAniListId;
const tvdb = parseTvdbId;
const tmdb = parseTmdbId;

const createDeps = (input: {
  ignores?: Array<{ anilistId: AniListId; provider: 'sonarr' | 'radarr' }>;
  manuals?: AnibridgeProviderPair[];
  upstream?: AnibridgeProviderPair[];
  resolverStates?: Array<AutoMappingRecord & { anilistId: AniListId; provider: 'sonarr' | 'radarr' }>;
}): GetMappingIdentitiesDeps => ({
  manualMappingService: {
    get: ((provider, anilistId) => (input.manuals ?? [])
      .find(entry => entry.provider === provider && entry.anilistId === anilistId)?.providerId ?? null) as GetMappingIdentitiesDeps['manualMappingService']['get'],
    isIgnored: (provider, anilistId) => (input.ignores ?? [])
      .some(entry => entry.provider === provider && entry.anilistId === anilistId),
    listRejectedCandidates: () => [],
    listIgnores: () => input.ignores ?? [],
    list: () => input.manuals ?? [],
  },
  anibridgeMappingStore: {
    listAllProviderPairs: () => input.upstream ?? [],
    getSonarrCandidates: (anilistId) => (input.upstream ?? [])
      .filter((entry): entry is Extract<AnibridgeProviderPair, { provider: 'sonarr' }> =>
        entry.provider === 'sonarr' && entry.anilistId === anilistId)
      .map(entry => entry.providerId),
    getRadarrCandidates: (anilistId) => (input.upstream ?? [])
      .filter((entry): entry is Extract<AnibridgeProviderPair, { provider: 'radarr' }> =>
        entry.provider === 'radarr' && entry.anilistId === anilistId)
      .map(entry => entry.providerId),
  },
  autoMappingStore: {
    get: async (provider, anilistId) => (input.resolverStates ?? [])
      .find(entry => entry.provider === provider && entry.anilistId === anilistId) ?? null,
    list: async () => input.resolverStates ?? [],
  },
});

describe('getMappingIdentities', () => {
  it('projects known identities with canonical precedence and omits absent IDs', async () => {
    const identities = await getMappingIdentities(
      [aid(1), aid(2), aid(3), aid(4)],
      createDeps({
        ignores: [{ anilistId: aid(1), provider: 'sonarr' }],
        manuals: [
          { anilistId: aid(1), provider: 'sonarr', providerId: tvdb(111) },
          { anilistId: aid(3), provider: 'radarr', providerId: tmdb(333) },
        ],
        upstream: [
          { anilistId: aid(2), provider: 'sonarr', providerId: tvdb(222) },
        ],
        resolverStates: [
          {
            anilistId: aid(2),
            provider: 'sonarr',
            state: 'mapped',
            providerId: tvdb(999),
            acceptedEvidence: { source: 'auto', reason: 'fuzzy-match' },
            updatedAt: 1,
          },
        ],
      }),
    );

    expect(identities).toEqual([
      {
        anilistId: aid(1),
        provider: 'sonarr',
        providerId: null,
        providerMappingState: 'unmapped',
        mappingEntryKind: 'ignored',
      },
      {
        anilistId: aid(2),
        provider: 'sonarr',
        providerId: tvdb(222),
        providerMappingState: 'mapped',
        mappingEntryKind: 'upstream',
        mappingSource: 'upstream',
        mappingReason: 'exact-upstream',
      },
      {
        anilistId: aid(3),
        provider: 'radarr',
        providerId: tmdb(333),
        providerMappingState: 'mapped',
        mappingEntryKind: 'manual',
        mappingSource: 'manual',
        mappingReason: 'manual-override',
      },
    ]);
  });
});
