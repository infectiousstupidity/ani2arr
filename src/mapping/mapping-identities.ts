import type { AniListId } from '@/anilist';
import { PROVIDERS, type Provider, type ProviderIdFor, type ProviderTargetId, type TmdbId, type TvdbId } from '@/providers';
import type { AnibridgeProviderPair } from '@/mapping/upstream';
import type { MappingIdentity } from '@/mapping/types';
import type { AutoMappingRecord } from '@/mapping/auto-mapping/types';
import { buildEffectiveMapping } from './effective-mapping';
import { getMappingFacts } from './mapping-facts';

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
    listAllProviderPairs(): AnibridgeProviderPair[];
  };
  autoMappingStore: {
    get(provider: Provider, anilistId: AniListId): Promise<AutoMappingRecord | null>;
    list(provider?: Provider): Promise<Array<AutoMappingRecord & { anilistId: AniListId; provider: Provider }>>;
  };
}

const createKey = (provider: Provider, anilistId: AniListId): string => `${provider}:${anilistId}`;

const toMappingIdentity = (identity: MappingIdentity): MappingIdentity => ({
  anilistId: identity.anilistId,
  provider: identity.provider,
  providerId: identity.providerId,
  providerMappingState: identity.providerMappingState,
  mappingEntryKind: identity.mappingEntryKind,
  ...(identity.mappingSource ? { mappingSource: identity.mappingSource } : {}),
  ...(identity.mappingReason ? { mappingReason: identity.mappingReason } : {}),
});

export async function getMappingIdentities(
  ids: readonly AniListId[],
  deps: GetMappingIdentitiesDeps,
): Promise<MappingIdentity[]> {
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

  for (const resolverState of await deps.autoMappingStore.list()) {
    if (!requestedIds.has(resolverState.anilistId)) continue;
    const key = createKey(resolverState.provider, resolverState.anilistId);
    keys.add(key);
  }

  const identities: MappingIdentity[] = [];
  for (const anilistId of requestedIds) {
    for (const provider of PROVIDERS) {
      const key = createKey(provider, anilistId);
      if (!keys.has(key)) continue;
      const facts = await getMappingFacts(provider, anilistId, deps);

      const identity = buildEffectiveMapping({
        provider,
        anilistId,
        manualProviderId: facts.manualProviderId,
        ignored: facts.ignored,
        upstreamProviderIds: facts.upstreamProviderIds,
        rejectedProviderId: facts.rejectedProviderId,
        resolverState: facts.autoMappingRecord,
      });
      identities.push(toMappingIdentity(identity));
    }
  }

  return identities;
}
