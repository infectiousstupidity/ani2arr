/** Lists flat effective mapping records and discovers active AniList identities. */
// src/mapping/list-mappings.ts

import type { AniListId, AniListMediaFormat } from "@/anilist/types";
import type { MappingService } from "@/mapping/mapping.service";
import { PROVIDERS, type Provider } from "@/providers/types";
import { listSourceAutoResults } from "./auto.store";
import { listSourceManualFacts } from "./manual.store";
import {
	collectEffectiveMappingRecords,
	type EffectiveMappingRecord,
} from "./mapping-facts";
import { sourceIdentityKey, type SourceIdentity } from "./source-identity";
import type { MappingResult, UpstreamTarget } from "./types";
import {
	listSourceUpstreamMappings,
	type UpstreamSourceFact,
} from "./upstream.store";

export interface ActiveMappingIdentity {
	source: SourceIdentity;
	anilistId: AniListId;
	provider: Provider;
	result: MappingResult;
}

interface MappingReadDeps {
	mappingService: Pick<MappingService, "getMapping">;
}

interface EffectiveMappingListDeps {
	loadFormatByAniListId?: (
		ids: readonly AniListId[],
	) => Promise<ReadonlyMap<AniListId, AniListMediaFormat | null | undefined>>;
}

export async function listEffectiveMappingRecords(
	provider: Provider,
	deps: EffectiveMappingListDeps = {},
): Promise<EffectiveMappingRecord[]> {
	const upstreamFacts = await listSourceUpstreamMappings();
	return collectListRecords(provider, upstreamFacts, deps);
}

export async function listEffectiveMappingRecordsByProvider(
	deps: EffectiveMappingListDeps = {},
): Promise<Record<Provider, EffectiveMappingRecord[]>> {
	const upstreamFacts = await listSourceUpstreamMappings();
	const [sonarr, radarr] = await Promise.all([
		collectListRecords("sonarr", upstreamFacts, deps),
		collectListRecords("radarr", upstreamFacts, deps),
	]);

	return { sonarr, radarr };
}

export async function getMappingIdentities(
	ids: readonly AniListId[],
	deps: MappingReadDeps,
): Promise<ActiveMappingIdentity[]> {
	const requestedIds = new Set(ids);
	if (requestedIds.size === 0) return [];

	const keys = new Set<string>();

	for (const provider of PROVIDERS) {
		const [manualRecords, autoRecords] = await Promise.all([
			listSourceManualFacts(provider),
			listSourceAutoResults(provider),
		]);

		for (const record of manualRecords) {
			if (record.source.source === "anilist" && requestedIds.has(record.source.id)) {
				keys.add(createIdentityKey(provider, record.source.id));
			}
		}

		for (const record of autoRecords) {
			if (record.source.source === "anilist" && requestedIds.has(record.source.id)) {
				keys.add(createIdentityKey(provider, record.source.id));
			}
		}
	}

	for (const record of await listSourceUpstreamMappings()) {
		if (record.source.source !== "anilist" || !requestedIds.has(record.anilistId)) {
			continue;
		}

		for (const target of record.targets) {
			keys.add(createIdentityKey(target.provider, record.anilistId));
		}
	}

	return Promise.all(
		[...requestedIds].flatMap((anilistId) =>
			PROVIDERS.flatMap((provider) =>
				keys.has(createIdentityKey(provider, anilistId))
					? [
							deps.mappingService.getMapping(provider, anilistId).then(
								(result): ActiveMappingIdentity => ({
									source: anilistSource(anilistId),
									anilistId,
									provider,
									result,
								}),
							),
						]
					: [],
			),
		),
	);
}

async function collectListRecords(
	provider: Provider,
	upstreamFacts: readonly UpstreamSourceFact[],
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
	records: readonly UpstreamSourceFact[],
	deps: EffectiveMappingListDeps,
): Promise<ReadonlyMap<string, readonly UpstreamTarget[]>> {
	const movieIdsWithRadarrTargets = await getMovieIdsWithRadarrTargets(
		provider,
		records,
		deps,
	);
	const upstreamBySourceKey = new Map<string, UpstreamTarget[]>();

	for (const record of records) {
		const targets =
			provider === "sonarr" && movieIdsWithRadarrTargets.has(record.anilistId)
				? []
				: record.targets.filter((target) => target.provider === provider);

		if (targets.length > 0) {
			upstreamBySourceKey.set(sourceIdentityKey(record.source), targets);
		}
	}

	return upstreamBySourceKey;
}

async function getMovieIdsWithRadarrTargets(
	provider: Provider,
	upstreamFacts: readonly UpstreamSourceFact[],
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

function anilistSource(anilistId: AniListId): SourceIdentity {
	return { source: "anilist", id: anilistId };
}
