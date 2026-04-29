import type { AniListId } from "@/anilist";
import {
	parseProviderIdentity,
	type Provider,
	type ProviderIdFor,
	type ProviderId,
	type TmdbId,
	type TvdbId,
} from "@/providers";
import type { AutoMappingRecord } from "./auto-mapping/types";

export interface CollectedMappingSources {
	provider: Provider;
	anilistId: AniListId;
	manualMappedProviderId: ProviderId | null;
	ignored: boolean;
	upstreamProviderIds: readonly ProviderId[];
	rejectedCandidateProviderId: ProviderId | null;
	autoMappingRecord: AutoMappingRecord | null;
}

export interface CollectMappingSourcesDeps {
	manualMappingService: {
		get<P extends Provider>(
			provider: P,
			anilistId: AniListId,
		): ProviderIdFor<P> | null;
		isIgnored(provider: Provider, anilistId: AniListId): boolean;
		listRejectedCandidates(provider?: Provider): Array<{
			anilistId: AniListId;
			provider: Provider;
			providerId: ProviderId;
			updatedAt: number;
		}>;
	};
	anibridgeMappingStore: {
		getSonarrCandidates(anilistId: AniListId): TvdbId[];
		getRadarrCandidates(anilistId: AniListId): TmdbId[];
	};
	autoMappingStore: {
		get(
			provider: Provider,
			anilistId: AniListId,
		): Promise<AutoMappingRecord | null>;
	};
}

export interface CollectLinkedAniListIdsDeps {
	manualMappingService: {
		getLinkedAniListIds<P extends Provider>(
			provider: P,
			providerId: ProviderIdFor<P>,
		): AniListId[];
	};
	anibridgeMappingStore: {
		getAniListIdsForTvdb(tvdbId: TvdbId): AniListId[];
		getAniListIdsForTmdb(tmdbId: TmdbId): AniListId[];
	};
	autoMappingStore: {
		list(
			provider?: Provider,
		): Promise<
			Array<AutoMappingRecord & { anilistId: AniListId; provider: Provider }>
		>;
	};
}

const getUpstreamProviderIds = (
	provider: Provider,
	anilistId: AniListId,
	deps: CollectMappingSourcesDeps,
): readonly ProviderId[] =>
	provider === "sonarr"
		? deps.anibridgeMappingStore.getSonarrCandidates(anilistId)
		: deps.anibridgeMappingStore.getRadarrCandidates(anilistId);

const latestRejectedCandidateProviderId = (
	rejected: Array<{
		anilistId: AniListId;
		providerId: ProviderId;
		updatedAt: number;
	}>,
	anilistId: AniListId,
): ProviderId | null =>
	rejected
		.filter((entry) => entry.anilistId === anilistId)
		.toSorted((left, right) => right.updatedAt - left.updatedAt)[0]
		?.providerId ?? null;

export async function getMappingSource(
	provider: Provider,
	anilistId: AniListId,
	deps: CollectMappingSourcesDeps,
): Promise<CollectedMappingSources> {
	const rejected = deps.manualMappingService.listRejectedCandidates(provider);
	const autoMappingRecord = await deps.autoMappingStore.get(
		provider,
		anilistId,
	);

	return {
		provider,
		anilistId,
		manualMappedProviderId: deps.manualMappingService.get(provider, anilistId),
		ignored: deps.manualMappingService.isIgnored(provider, anilistId),
		upstreamProviderIds: getUpstreamProviderIds(provider, anilistId, deps),
		rejectedCandidateProviderId: latestRejectedCandidateProviderId(
			rejected,
			anilistId,
		),
		autoMappingRecord,
	};
}

export async function collectLinkedAniListIds(
	provider: Provider,
	providerId: ProviderId,
	deps: CollectLinkedAniListIdsDeps,
): Promise<AniListId[]> {
	const identity = parseProviderIdentity(provider, providerId);
	const ids = new Set<AniListId>();

	if (identity.provider === "sonarr") {
		for (const id of deps.manualMappingService.getLinkedAniListIds(
			identity.provider,
			identity.providerId,
		)) {
			ids.add(id);
		}
		for (const id of deps.anibridgeMappingStore.getAniListIdsForTvdb(
			identity.providerId,
		)) {
			ids.add(id);
		}
	} else {
		for (const id of deps.manualMappingService.getLinkedAniListIds(
			identity.provider,
			identity.providerId,
		)) {
			ids.add(id);
		}
		for (const id of deps.anibridgeMappingStore.getAniListIdsForTmdb(
			identity.providerId,
		)) {
			ids.add(id);
		}
	}

	for (const autoMapping of await deps.autoMappingStore.list(
		identity.provider,
	)) {
		if (
			autoMapping.state === "mapped" &&
			autoMapping.providerId === identity.providerId
		) {
			ids.add(autoMapping.anilistId);
		}
	}

	return [...ids].toSorted((left, right) => left - right);
}
