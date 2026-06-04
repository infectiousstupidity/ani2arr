/** Builds mapping-only list and identity results from active mapping results. */
// src/mapping/list-mappings.ts

import type { AniListId, AniListMediaFormat } from "@/anilist/types";
import {
	chooseMappingResult,
	type MappingService,
} from "@/mapping/mapping.service";
import { PROVIDERS } from "@/providers/types";
import type { Provider } from "@/providers/types";

import { listAutoResults } from "./auto.store";
import { listManualFacts, type ManualFacts } from "./manual.store";
import type { AutoResult, MappingResult, UpstreamTarget } from "./types";
import { listUpstreamMappings } from "./upstream.store";

type MappedResult = Extract<MappingResult, { kind: "mapped" }>;
type IgnoredResult = Extract<MappingResult, { kind: "ignored" }>;
type AmbiguousResult = Extract<MappingResult, { kind: "ambiguous" }>;
type UnmappedResult = Extract<MappingResult, { kind: "unmapped" }>;

export interface MappingListEntry {
	anilistId: AniListId;
	result: MappingResult;
}

export interface MappedMappingListEntry {
	anilistId: AniListId;
	result: MappedResult;
}

export interface IgnoredMappingListEntry {
	anilistId: AniListId;
	result: IgnoredResult;
}

export interface AmbiguousMappingListEntry {
	anilistId: AniListId;
	result: AmbiguousResult;
}

export interface UnmappedMappingListEntry {
	anilistId: AniListId;
	result: UnmappedResult;
}

export interface MappedTargetGroup {
	providerId: MappedResult["providerId"];
	season?: number;
	entries: MappedMappingListEntry[];
}

export interface MappingList {
	provider: Provider;
	mapped: MappedTargetGroup[];
	ignored: IgnoredMappingListEntry[];
	ambiguous: AmbiguousMappingListEntry[];
	unmapped: UnmappedMappingListEntry[];
}

export interface ActiveMappingIdentity {
	anilistId: AniListId;
	provider: Provider;
	result: MappingResult;
}

interface MappingReadDeps {
	mappingService: Pick<MappingService, "getMapping">;
}

interface MappingListDeps {
	loadFormatByAniListId?: (
		ids: readonly AniListId[],
	) => Promise<ReadonlyMap<AniListId, AniListMediaFormat | null | undefined>>;
}

export async function getMappingList(
	provider: Provider,
	deps: MappingListDeps = {},
): Promise<MappingList> {
	return listMappings(provider, await collectMappingEntries(provider, deps));
}

export function listMappings(
	provider: Provider,
	entries: readonly MappingListEntry[],
): MappingList {
	const mapped = new Map<string, MappedTargetGroup>();
	const ignored: IgnoredMappingListEntry[] = [];
	const ambiguous: AmbiguousMappingListEntry[] = [];
	const unmapped: UnmappedMappingListEntry[] = [];

	for (const entry of entries) {
		switch (entry.result.kind) {
			case "mapped": {
				addMappedEntry(mapped, {
					anilistId: entry.anilistId,
					result: entry.result,
				});
				break;
			}

			case "ignored": {
				ignored.push({
					anilistId: entry.anilistId,
					result: entry.result,
				});
				break;
			}

			case "ambiguous": {
				ambiguous.push({
					anilistId: entry.anilistId,
					result: entry.result,
				});
				break;
			}

			case "unmapped": {
				unmapped.push({
					anilistId: entry.anilistId,
					result: entry.result,
				});
				break;
			}
		}
	}

	return {
		provider,
		mapped: [...mapped.values()]
			.map((group) => sortGroupEntries(group))
			.toSorted(compareGroups),
		ignored: ignored.toSorted(compareEntries),
		ambiguous: ambiguous.toSorted(compareEntries),
		unmapped: unmapped.toSorted(compareEntries),
	};
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
			listManualFacts(provider),
			listAutoResults(provider),
		]);

		for (const record of manualRecords) {
			if (requestedIds.has(record.anilistId)) {
				keys.add(createIdentityKey(provider, record.anilistId));
			}
		}

		for (const record of autoRecords) {
			if (requestedIds.has(record.anilistId)) {
				keys.add(createIdentityKey(provider, record.anilistId));
			}
		}
	}

	for (const record of await listUpstreamMappings()) {
		if (!requestedIds.has(record.anilistId)) continue;

		for (const target of record.targets) {
			keys.add(createIdentityKey(target.provider, record.anilistId));
		}
	}

	const identities = await Promise.all(
		[...requestedIds].flatMap((anilistId) =>
			PROVIDERS.flatMap((provider) =>
				keys.has(createIdentityKey(provider, anilistId))
					? [
							deps.mappingService.getMapping(provider, anilistId).then(
								(result): ActiveMappingIdentity => ({
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

	return identities;
}

async function collectMappingEntries(
	provider: Provider,
	deps: MappingListDeps,
): Promise<MappingListEntry[]> {
	const keys = new Set<AniListId>();
	const [manualRecords, autoRecords, upstreamRecords] = await Promise.all([
		listManualFacts(provider),
		listAutoResults(provider),
		listUpstreamMappings(),
	]);
	const movieIdsWithRadarrTargets = await getMovieIdsWithRadarrTargets(
		provider,
		upstreamRecords,
		deps,
	);

	const manualByAniListId = new Map<AniListId, ManualFacts>();
	const autoByAniListId = new Map<AniListId, AutoResult>();
	const upstreamByAniListId = new Map<AniListId, UpstreamTarget[]>();

	for (const record of manualRecords) {
		keys.add(record.anilistId);
		manualByAniListId.set(record.anilistId, record.facts);
	}

	for (const record of autoRecords) {
		keys.add(record.anilistId);
		autoByAniListId.set(record.anilistId, record.result);
	}

	for (const record of upstreamRecords) {
		const targets = getProviderUpstreamTargets(
			provider,
			record,
			movieIdsWithRadarrTargets,
		);
		if (targets.length > 0) {
			keys.add(record.anilistId);
			upstreamByAniListId.set(record.anilistId, targets);
		}
	}

	return [...keys].map((anilistId): MappingListEntry => ({
		anilistId,
		result: chooseMappingResult(
			provider,
			manualByAniListId.get(anilistId) ?? null,
			upstreamByAniListId.get(anilistId) ?? [],
			autoByAniListId.get(anilistId) ?? null,
		),
	}));
}

function getProviderUpstreamTargets(
	provider: Provider,
	record: { anilistId: AniListId; targets: readonly UpstreamTarget[] },
	movieIdsWithRadarrTargets: ReadonlySet<AniListId>,
): UpstreamTarget[] {
	if (provider === "sonarr" && movieIdsWithRadarrTargets.has(record.anilistId)) {
		return [];
	}

	return record.targets.filter((target) => target.provider === provider);
}

async function getMovieIdsWithRadarrTargets(
	provider: Provider,
	upstreamRecords: readonly {
		anilistId: AniListId;
		targets: readonly UpstreamTarget[];
	}[],
	deps: MappingListDeps,
): Promise<ReadonlySet<AniListId>> {
	if (provider !== "sonarr" || !deps.loadFormatByAniListId) {
		return new Set();
	}

	const candidateIds = upstreamRecords.flatMap((record) => {
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
	const movieIds = new Set<AniListId>();
	for (const id of candidateIds) {
		if (formatByAniListId.get(id) === "MOVIE") {
			movieIds.add(id);
		}
	}
	return movieIds;
}

function addMappedEntry(
	groups: Map<string, MappedTargetGroup>,
	entry: MappedMappingListEntry,
): void {
	const key = createTargetKey(entry.result);
	const existing = groups.get(key);

	if (existing) {
		existing.entries.push(entry);
		return;
	}

	groups.set(key, {
		providerId: entry.result.providerId,
		...(entry.result.season === undefined
			? {}
			: { season: entry.result.season }),
		entries: [entry],
	});
}

function createTargetKey(result: MappedResult): string {
	return `${result.providerId}:${result.season ?? ""}`;
}

function createIdentityKey(provider: Provider, anilistId: AniListId): string {
	return `${provider}:${anilistId}`;
}

function sortGroupEntries(group: MappedTargetGroup): MappedTargetGroup {
	return {
		...group,
		entries: group.entries.toSorted(compareEntries),
	};
}

function compareGroups(
	left: MappedTargetGroup,
	right: MappedTargetGroup,
): number {
	const providerIdDifference =
		Number(left.providerId) - Number(right.providerId);

	if (providerIdDifference !== 0) {
		return providerIdDifference;
	}

	return (left.season ?? -1) - (right.season ?? -1);
}

function compareEntries(
	left: { anilistId: AniListId },
	right: { anilistId: AniListId },
): number {
	return Number(left.anilistId) - Number(right.anilistId);
}
