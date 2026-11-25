/** Lists flat effective mapping records and discovers active AniList identities. */

import { isAniListId, type AniListId } from "@/anilist/types";
import { PROVIDERS, type Provider } from "@/providers/types";
import { listAniListAutomaticLayers, readAutomaticRecords } from "./auto.store";
import {
	type EffectiveMappingRecord,
	type MappingSelectionRecords,
	selectArrMapping,
} from "./effective-mapping";
import { listAniListManualLayers, readManualRecords } from "./manual.store";
import { sourceIdentityKey, type SourceIdentity } from "./source-identity";
import type { MappingResult } from "./types";
import {
	listAniListUpstreamLayers,
	readSnapshotRecords,
} from "./upstream.store";

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
	const manual = new Map(
		manualRecords.map(({ anilistId, record }) => [anilistId, record]),
	);
	const upstream = new Map(
		upstreamRecords.map(({ anilistId, record }) => [anilistId, record]),
	);
	const automatic = new Map(
		automaticRecords.map(({ anilistId, record }) => [anilistId, record]),
	);
	const ids = new Set([
		...manual.keys(),
		...upstream.keys(),
		...automatic.keys(),
	]);
	const result: Record<Provider, EffectiveMappingRecord[]> = {
		sonarr: [],
		radarr: [],
	};
	for (const anilistId of [...ids].toSorted((left, right) => left - right)) {
		const records: MappingSelectionRecords = {
			manual: manual.get(anilistId) ?? null,
			direct: upstream.get(anilistId) ?? null,
			canonical: null,
			automatic: automatic.get(anilistId) ?? null,
		};
		for (const provider of PROVIDERS) {
			if (!hasMappingState(provider, records)) continue;
			result[provider].push({
				anilistId,
				provider,
				result: selectArrMapping(provider, records),
			});
		}
	}
	return result;
}

export async function getMappingIdentities(
	ids: readonly AniListId[],
): Promise<ActiveMappingIdentity[]> {
	const requestedIds = new Set(ids);
	if (requestedIds.size === 0) return [];
	const [getManual, getUpstream, getAutomatic] = await Promise.all([
		readManualRecords(),
		readSnapshotRecords(),
		readAutomaticRecords(),
	]);
	const identities: ActiveMappingIdentity[] = [];
	for (const anilistId of requestedIds) {
		if (!isAniListId(anilistId)) continue;
		const key = sourceIdentityKey({ source: "anilist", id: anilistId });
		const records: MappingSelectionRecords = {
			manual: getManual(key) ?? null,
			direct: getUpstream(key) ?? null,
			canonical: null,
			automatic: getAutomatic(key) ?? null,
		};
		for (const provider of PROVIDERS) {
			if (!hasMappingState(provider, records)) continue;
			identities.push({
				source: { source: "anilist", id: anilistId },
				anilistId,
				provider,
				result: selectArrMapping(provider, records),
			});
		}
	}
	return identities;
}

function hasMappingState(
	provider: Provider,
	records: MappingSelectionRecords,
): boolean {
	if (records.manual?.decisions?.[provider]) return true;
	const slot = provider === "sonarr" ? "tvdbShow" : "tmdbMovie";
	if (
		[records.manual, records.direct, records.automatic].some(
			(record) =>
				record?.facts[slot] !== undefined ||
				record?.conflicts?.[slot] !== undefined,
		)
	)
		return true;
	const lane = provider === "sonarr" ? "sonarrTvdb" : "radarrTmdbMovie";
	return (records.automatic?.attempts?.[lane]?.expiresAt ?? 0) > Date.now();
}
