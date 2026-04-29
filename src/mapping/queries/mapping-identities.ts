import type { AniListId } from '@/anilist';
import { PROVIDERS, type Provider, type ProviderIdFor, type ProviderTargetId, type TmdbId, type TvdbId } from '@/providers';
import type { AnibridgeMappingPair } from '@/mapping/upstream';
import type { AutoMappingRecord } from '@/mapping/auto-mapping/types';
import { buildEffectiveMapping, type EffectiveMapping } from '../effective-mapping';
import { getMappingSource } from '../mapping-sources';

export type EffectiveMappingPresence = Pick<
  EffectiveMapping,
  | 'anilistId'
  | 'provider'
  | 'providerId'
  | 'providerMappingState'
  | 'mappingEntryKind'
  | 'mappingSource'
  | 'mappingReason'
>;

export interface GetMappingIdentitiesDeps {
  manualMappingService: {
    get<P extends Provider>(provider: P, anilistId: AniListId): ProviderIdFor<P> | null;
    isIgnored(provider: Provider, anilistId: AniListId): boolean;
    listRejectedCandidates(provider?: Provider): Array<{
      anilistId: AniListId;
      provider: Provider;
      providerId: ProviderTargetId;
      updatedAt: number;
    }>;
    listIgnores(): Array<{ anilistId: AniListId; provider: Provider }>;
    list(): Array<{ anilistId: AniListId; provider: Provider; providerId: ProviderTargetId }>;
  };
  anibridgeMappingStore: {
    getSonarrCandidates(anilistId: AniListId): TvdbId[];
    getRadarrCandidates(anilistId: AniListId): TmdbId[];
    listAllProviderPairs(): AnibridgeMappingPair[];
  };
  autoMappingStore: {
    get(provider: Provider, anilistId: AniListId): Promise<AutoMappingRecord | null>;
    list(provider?: Provider): Promise<Array<AutoMappingRecord & { anilistId: AniListId; provider: Provider }>>;
  };
}

const createKey = (provider: Provider, anilistId: AniListId): string => `${provider}:${anilistId}`;

const toEffectiveMappingPresence = (mapping: EffectiveMapping): EffectiveMappingPresence => ({
  anilistId: mapping.anilistId,
  provider: mapping.provider,
  providerId: mapping.providerId,
  providerMappingState: mapping.providerMappingState,
  mappingEntryKind: mapping.mappingEntryKind,
  ...(mapping.mappingSource ? { mappingSource: mapping.mappingSource } : {}),
  ...(mapping.mappingReason ? { mappingReason: mapping.mappingReason } : {}),
});

export async function getMappingIdentities(
  ids: readonly AniListId[],
  deps: GetMappingIdentitiesDeps,
): Promise<EffectiveMappingPresence[]> {
  const requestedIds = new Set(ids);
  if (requestedIds.size === 0) {
    return [];
  }

  const keys = new Set<string>();

  for (const ignore of deps.manualMappingService.listIgnores()) {
    if (!requestedIds.has(ignore.anilistId)) continue;
    const key = createKey(ignore.provider, ignore.anilistId);
    keys.add(key);
  }

  for (const manual of deps.manualMappingService.list()) {
    if (!requestedIds.has(manual.anilistId)) continue;
    const key = createKey(manual.provider, manual.anilistId);
    keys.add(key);
  }

  for (const pair of deps.anibridgeMappingStore.listAllProviderPairs()) {
    if (!requestedIds.has(pair.anilistId)) continue;
    keys.add(createKey(pair.provider, pair.anilistId));
  }

  for (const autoMappingRecord of await deps.autoMappingStore.list()) {
    if (!requestedIds.has(autoMappingRecord.anilistId)) continue;
    const key = createKey(autoMappingRecord.provider, autoMappingRecord.anilistId);
    keys.add(key);
  }

  const identities: EffectiveMappingPresence[] = [];
  for (const anilistId of requestedIds) {
    for (const provider of PROVIDERS) {
      const key = createKey(provider, anilistId);
      if (!keys.has(key)) continue;
      const mappingSource = await getMappingSource(provider, anilistId, deps);

      const identity = buildEffectiveMapping({
        provider,
        anilistId,
        manualProviderId: mappingSource.manualMappedProviderId,
        ignored: mappingSource.ignored,
        upstreamProviderIds: mappingSource.upstreamProviderIds,
        rejectedCandidateProviderId: mappingSource.rejectedCandidateProviderId,
        autoMappingRecord: mappingSource.autoMappingRecord,
      });
      identities.push(toEffectiveMappingPresence(identity));
    }
  }

  return identities;
}
