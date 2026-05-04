// src/mapping/queries/mapping-sources.ts
import type { AniListId } from "@/anilist";
import {
	type Provider,
	type TmdbId,
	type TvdbId,
} from "@/providers";
import {
	parseProviderExternalId,
	type ProviderExternalId,
} from "@/mapping/types";
import type { AutoMappingRecord } from "../auto-mapping/types";

export interface CollectedMappingSources {
	provider: Provider;
	anilistId: AniListId;
	manualMappedProviderId: ProviderExternalId | null;
	ignored: boolean;
	upstreamProviderIds: readonly ProviderExternalId[];
	rejectedCandidateProviderId: ProviderExternalId | null;
	autoMappingRecord: AutoMappingRecord | null;
}

export interface CollectMappingSourcesDeps {
	manualMappingService: {
		get<P extends Provider>(
			provider: P,
			anilistId: AniListId,
		): ProviderExternalId | null;
		isIgnored(provider: Provider, anilistId: AniListId): boolean;
		listRejectedCandidates(provider?: Provider): Array<{
			anilistId: AniListId;
			provider: Provider;
			providerId: ProviderExternalId;
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
			providerId: ProviderExternalId,
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
): readonly ProviderExternalId[] =>
	provider === "sonarr"
		? deps.anibridgeMappingStore.getSonarrCandidates(anilistId)
		: deps.anibridgeMappingStore.getRadarrCandidates(anilistId);

const latestRejectedCandidateProviderId = (
	rejected: Array<{
		anilistId: AniListId;
		providerId: ProviderExternalId;
		updatedAt: number;
	}>,
	anilistId: AniListId,
): ProviderExternalId | null =>
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
	providerId: ProviderExternalId,
	deps: CollectLinkedAniListIdsDeps,
): Promise<AniListId[]> {
	const ids = new Set<AniListId>();

	if (provider === "sonarr") {
		const tvdbId = parseProviderExternalId("sonarr", providerId);
		if (tvdbId === null) return [];
		for (const id of deps.manualMappingService.getLinkedAniListIds(
			provider,
			tvdbId,
		)) {
			ids.add(id);
		}
		for (const id of deps.anibridgeMappingStore.getAniListIdsForTvdb(tvdbId)) {
			ids.add(id);
		}
	} else {
		const tmdbId = parseProviderExternalId("radarr", providerId);
		if (tmdbId === null) return [];
		for (const id of deps.manualMappingService.getLinkedAniListIds(
			provider,
			tmdbId,
		)) {
			ids.add(id);
		}
		for (const id of deps.anibridgeMappingStore.getAniListIdsForTmdb(tmdbId)) {
			ids.add(id);
		}
	}

	for (const autoMapping of await deps.autoMappingStore.list(provider)) {
		if (
			autoMapping.state === "mapped" &&
			autoMapping.providerId === providerId
		) {
			ids.add(autoMapping.anilistId);
		}
	}

	return [...ids].toSorted((left, right) => left - right);
}
