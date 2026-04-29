import type { AniListId } from '@/anilist';
import { parseProviderIdentity, type Provider, type ProviderIdFor, type ProviderTargetId, type TmdbId, type TvdbId } from '@/providers';
import type { AutoMappingRecord } from './auto-mapping/types';

export interface MappingFacts {
  manualProviderId: ProviderTargetId | null;
  ignored: boolean;
  upstreamProviderIds: readonly ProviderTargetId[];
  rejectedProviderId: ProviderTargetId | null;
  autoMappingRecord: AutoMappingRecord | null;
}

export interface MappingFactsDeps {
  manualMappingService: {
    get<P extends Provider>(provider: P, anilistId: AniListId): ProviderIdFor<P> | null;
    isIgnored(provider: Provider, anilistId: AniListId): boolean;
    listRejectedCandidates(provider?: Provider): Array<{
      anilistId: AniListId;
      provider: Provider;
      providerId: ProviderTargetId;
      updatedAt: number;
    }>;
  };
  anibridgeMappingStore: {
    getSonarrCandidates(anilistId: AniListId): TvdbId[];
    getRadarrCandidates(anilistId: AniListId): TmdbId[];
  };
  autoMappingStore: {
    get(provider: Provider, anilistId: AniListId): Promise<AutoMappingRecord | null>;
  };
}

export interface LinkedAniListIdsDeps {
  manualMappingService: {
    getLinkedAniListIds<P extends Provider>(provider: P, providerId: ProviderIdFor<P>): AniListId[];
  };
  anibridgeMappingStore: {
    getAniListIdsForTvdb(tvdbId: TvdbId): AniListId[];
    getAniListIdsForTmdb(tmdbId: TmdbId): AniListId[];
  };
  autoMappingStore: {
    list(provider?: Provider): Promise<Array<AutoMappingRecord & { anilistId: AniListId; provider: Provider }>>;
  };
}

const latestRejectedProviderId = (
  rejected: Array<{ anilistId: AniListId; providerId: ProviderTargetId; updatedAt: number }>,
  anilistId: AniListId,
): ProviderTargetId | null => (
  rejected
    .filter((entry) => entry.anilistId === anilistId)
    .toSorted((left, right) => right.updatedAt - left.updatedAt)[0]?.providerId ?? null
);

export async function getMappingFacts(
  provider: Provider,
  anilistId: AniListId,
  deps: MappingFactsDeps,
): Promise<MappingFacts> {
  const rejected = deps.manualMappingService.listRejectedCandidates(provider);
  const autoMappingRecord = await deps.autoMappingStore.get(provider, anilistId);

  return {
    manualProviderId: deps.manualMappingService.get(provider, anilistId),
    ignored: deps.manualMappingService.isIgnored(provider, anilistId),
    upstreamProviderIds: provider === 'sonarr'
      ? deps.anibridgeMappingStore.getSonarrCandidates(anilistId)
      : deps.anibridgeMappingStore.getRadarrCandidates(anilistId),
    rejectedProviderId: latestRejectedProviderId(rejected, anilistId),
    autoMappingRecord,
  };
}

export async function collectLinkedAniListIds(
  provider: Provider,
  providerId: ProviderTargetId,
  deps: LinkedAniListIdsDeps,
): Promise<AniListId[]> {
  const identity = parseProviderIdentity(provider, providerId);
  const ids = new Set<AniListId>();

  if (identity.provider === 'sonarr') {
    for (const id of deps.manualMappingService.getLinkedAniListIds(identity.provider, identity.providerId)) {
      ids.add(id);
    }
    for (const id of deps.anibridgeMappingStore.getAniListIdsForTvdb(identity.providerId)) {
      ids.add(id);
    }
  } else {
    for (const id of deps.manualMappingService.getLinkedAniListIds(identity.provider, identity.providerId)) {
      ids.add(id);
    }
    for (const id of deps.anibridgeMappingStore.getAniListIdsForTmdb(identity.providerId)) {
      ids.add(id);
    }
  }

  for (const autoMapping of await deps.autoMappingStore.list(identity.provider)) {
    if (autoMapping.state === 'mapped' && autoMapping.providerId === identity.providerId) {
      ids.add(autoMapping.anilistId);
    }
  }

  return [...ids].toSorted((left, right) => left - right);
}
