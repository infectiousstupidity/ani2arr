/** Lists flat effective mapping records and discovers active AniList identities. */
// src/mapping/list-mappings.ts

import type { AniListId, AniListMediaFormat } from "@/anilist/types";
import { PROVIDERS, type Provider } from "@/providers/types";
import {
	collectEffectiveMappingRecords,
	type EffectiveMappingRecord,
} from "./mapping-facts";
import type { SourceIdentity } from "./source-identity";
import type { MappingResult, UpstreamTarget } from "./types";
import {
	listAniListUpstreamMappings,
	type UpstreamMappingFact,
} from "./upstream.store";

export interface ActiveMappingIdentity {
	source: SourceIdentity;
	anilistId: AniListId;
	provider: Provider;
	result: MappingResult;
}

interface EffectiveMappingListDeps {
	loadFormatByAniListId?: (
		ids: readonly AniListId[],
	) => Promise<ReadonlyMap<AniListId, AniListMediaFormat | null | undefined>>;
}

export async function listEffectiveMappingRecordsByProvider(
	deps: EffectiveMappingListDeps = {},
): Promise<Record<Provider, EffectiveMappingRecord[]>> {
	const upstreamFacts = await listAniListUpstreamMappings();
	const [sonarr, radarr] = await Promise.all([
		collectListRecords("sonarr", upstreamFacts, deps),
		collectListRecords("radarr", upstreamFacts, deps),
	]);

	return { sonarr, radarr };
}

export async function getMappingIdentities(
	ids: readonly AniListId[],
): Promise<ActiveMappingIdentity[]> {
	const requestedIds = new Set(ids);
	if (requestedIds.size === 0) return [];

	const recordsByProvider = await listEffectiveMappingRecordsByProvider();
	const identitiesByKey = new Map<string, ActiveMappingIdentity>();

	for (const provider of PROVIDERS) {
		for (const record of recordsByProvider[provider]) {
			if (!requestedIds.has(record.anilistId)) {
				continue;
			}

			identitiesByKey.set(createIdentityKey(provider, record.anilistId), {
				source: { source: "anilist", id: record.anilistId },
				anilistId: record.anilistId,
				provider,
				result: record.result,
			});
		}
	}

	return [...requestedIds].flatMap((anilistId) =>
		PROVIDERS.flatMap((provider) => {
			const identity = identitiesByKey.get(
				createIdentityKey(provider, anilistId),
			);
			return identity ? [identity] : [];
		}),
	);
}

async function collectListRecords(
	provider: Provider,
	upstreamFacts: readonly UpstreamMappingFact[],
	deps: EffectiveMappingListDeps,
): Promise<EffectiveMappingRecord[]> {
	return collectEffectiveMappingRecords(provider, {
		upstreamFacts,
		selectUpstreamTargets: async (records) =>
			selectListUpstreamTargets(provider, records, deps),
	});
}

async function selectListUpstreamTargets(
	provider: Provider,
	records: readonly UpstreamMappingFact[],
	deps: EffectiveMappingListDeps,
): Promise<ReadonlyMap<AniListId, readonly UpstreamTarget[]>> {
	const movieIdsWithRadarrTargets = await getMovieIdsWithRadarrTargets(
		provider,
		records,
		deps,
	);
	const upstreamByAniListId = new Map<AniListId, UpstreamTarget[]>();

	for (const record of records) {
		const targets =
			provider === "sonarr" && movieIdsWithRadarrTargets.has(record.anilistId)
				? []
				: record.targets.filter((target) => target.provider === provider);

		if (targets.length > 0) {
			upstreamByAniListId.set(record.anilistId, targets);
		}
	}

	return upstreamByAniListId;
}

async function getMovieIdsWithRadarrTargets(
	provider: Provider,
	upstreamFacts: readonly UpstreamMappingFact[],
	deps: EffectiveMappingListDeps,
): Promise<ReadonlySet<AniListId>> {
	if (provider !== "sonarr" || !deps.loadFormatByAniListId) {
		return new Set();
	}

	const candidateIds = upstreamFacts.flatMap((record) => {
		const hasSonarrTarget = record.targets.some(
			(target) => target.provider === "sonarr",
		);
		const hasRadarrTarget = record.targets.some(
			(target) => target.provider === "radarr",
		);
		return hasSonarrTarget && hasRadarrTarget ? [record.anilistId] : [];
	});
	if (candidateIds.length === 0) return new Set();

	const formatByAniListId = await deps.loadFormatByAniListId(candidateIds);
	return new Set(
		candidateIds.filter((id) => formatByAniListId.get(id) === "MOVIE"),
	);
}

function createIdentityKey(provider: Provider, anilistId: AniListId): string {
	return `${provider}:${anilistId}`;
}
