/** Lists flat effective mapping records and discovers active AniList identities. */

import type { AniListId } from "@/anilist/types";
import { PROVIDERS, type Provider } from "@/providers/types";
import { listAniListAutomaticLayers } from "./auto.store";
import {
	hasMappingState,
	selectMappingResult,
	type EffectiveMappingRecord,
	type MappingSelectionRecords,
} from "./mapping-facts";
import { listAniListManualLayers } from "./manual.store";
import type { SourceIdentity } from "./source-identity";
import type { MappingResult } from "./types";
import { listAniListUpstreamLayers } from "./upstream.store";

export interface ActiveMappingIdentity {
	source: SourceIdentity;
	anilistId: AniListId;
	provider: Provider;
	result: MappingResult;
}

export async function listEffectiveMappingsByProvider(): Promise<
	Record<Provider, EffectiveMappingRecord[]>
> {
	const [manualRecords, upstreamRecords, automaticRecords] = await Promise.all([
		listAniListManualLayers(),
		listAniListUpstreamLayers(),
		listAniListAutomaticLayers(),
	]);
	const manualByAniListId = new Map(
		manualRecords.map(({ anilistId, record }) => [anilistId, record]),
	);
	const upstreamByAniListId = new Map(
		upstreamRecords.map(({ anilistId, record }) => [anilistId, record]),
	);
	const automaticByAniListId = new Map(
		automaticRecords.map(({ anilistId, record }) => [anilistId, record]),
	);
	const anilistIds = new Set([
		...manualByAniListId.keys(),
		...upstreamByAniListId.keys(),
		...automaticByAniListId.keys(),
	]);
	const sonarr: EffectiveMappingRecord[] = [];
	const radarr: EffectiveMappingRecord[] = [];

	for (const anilistId of [...anilistIds].toSorted(
		(left, right) => left - right,
	)) {
		const records: MappingSelectionRecords = {
			manual: manualByAniListId.get(anilistId) ?? null,
			upstream: upstreamByAniListId.get(anilistId) ?? null,
			automatic: automaticByAniListId.get(anilistId) ?? null,
		};
		if (hasMappingState("sonarr", records)) {
			sonarr.push({
				anilistId,
				provider: "sonarr",
				result: selectMappingResult("sonarr", records),
			});
		}
		if (hasMappingState("radarr", records)) {
			radarr.push({
				anilistId,
				provider: "radarr",
				result: selectMappingResult("radarr", records),
			});
		}
	}

	return { sonarr, radarr };
}

export async function getMappingIdentities(
	ids: readonly AniListId[],
): Promise<ActiveMappingIdentity[]> {
	const requestedIds = new Set(ids);
	if (requestedIds.size === 0) return [];

	const recordsByProvider = await listEffectiveMappingsByProvider();
	const identitiesByKey = new Map<string, ActiveMappingIdentity>();

	for (const provider of PROVIDERS) {
		for (const record of recordsByProvider[provider]) {
			if (!requestedIds.has(record.anilistId)) continue;
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

function createIdentityKey(provider: Provider, anilistId: AniListId): string {
	return `${provider}:${anilistId}`;
}
