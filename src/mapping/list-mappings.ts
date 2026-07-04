/** Builds mapping-only list and identity results from active mapping results. */
// src/mapping/list-mappings.ts

import type { AniListId, AniListMediaFormat } from "@/anilist/types";
import type { MappingService } from "@/mapping/mapping.service";
import { PROVIDERS } from "@/providers/types";
import type { Provider } from "@/providers/types";

import { listSourceAutoResults } from "./auto.store";
import { listSourceManualFacts } from "./manual.store";
import {
	collectActiveMappingFacts,
	type ActiveMappingUpstreamRecord,
} from "./mapping-facts";
import {
	sourceIdentityKey,
	type SourceIdentity,
} from "./source-identity";
import {
	type MappingResult,
	type UpstreamTarget,
} from "./types";
import { listSourceUpstreamMappings } from "./upstream.store";

type MappedResult = Extract<MappingResult, { kind: "mapped" }>;
type IgnoredResult = Extract<MappingResult, { kind: "ignored" }>;
type AmbiguousResult = Extract<MappingResult, { kind: "ambiguous" }>;
type UnmappedResult = Extract<MappingResult, { kind: "unmapped" }>;

export interface MappingListEntry {
	source: SourceIdentity;
	anilistId: AniListId;
	result: MappingResult;
}

export interface MappedMappingListEntry {
	source: SourceIdentity;
	anilistId: AniListId;
	result: MappedResult;
}

export interface IgnoredMappingListEntry {
	source: SourceIdentity;
	anilistId: AniListId;
	result: IgnoredResult;
}

export interface AmbiguousMappingListEntry {
	source: SourceIdentity;
	anilistId: AniListId;
	result: AmbiguousResult;
}

export interface UnmappedMappingListEntry {
	source: SourceIdentity;
	anilistId: AniListId;
	result: UnmappedResult;
}

export interface MappedTargetGroup {
	providerId: MappedResult["providerId"];
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
	source: SourceIdentity;
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

type SourceListRecord = {
	source: SourceIdentity;
	anilistId: AniListId;
};

type SourceUpstreamListRecord = SourceListRecord & {
	targets: readonly UpstreamTarget[];
};

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
					source: entry.source,
					anilistId: entry.anilistId,
					result: entry.result,
				});
				break;
			}

			case "ignored": {
				ignored.push({
					source: entry.source,
					anilistId: entry.anilistId,
					result: entry.result,
				});
				break;
			}

			case "ambiguous": {
				ambiguous.push({
					source: entry.source,
					anilistId: entry.anilistId,
					result: entry.result,
				});
				break;
			}

			case "unmapped": {
				unmapped.push({
					source: entry.source,
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
		if (record.source.source !== "anilist" || !requestedIds.has(record.source.id)) {
			continue;
		}

		for (const target of record.targets) {
			keys.add(createIdentityKey(target.provider, record.source.id));
		}
	}

	const identities = await Promise.all(
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

	return identities;
}

async function collectMappingEntries(
	provider: Provider,
	deps: MappingListDeps,
): Promise<MappingListEntry[]> {
	const records = await collectActiveMappingFacts(provider, {
		selectUpstreamTargets: async (upstreamRecords) =>
			selectListUpstreamTargets(provider, upstreamRecords, deps),
	});

	return records.flatMap((record): MappingListEntry[] =>
		record.anilistId === null
			? []
			: [
					{
						source: record.source,
						anilistId: record.anilistId,
						result: record.result,
					},
				],
	);
}

async function selectListUpstreamTargets(
	provider: Provider,
	records: readonly ActiveMappingUpstreamRecord[],
	deps: MappingListDeps,
): Promise<ReadonlyMap<string, readonly UpstreamTarget[]>> {
	const linkedRecords = records.flatMap((record): SourceUpstreamListRecord[] =>
		record.anilistId === null
			? []
			: [
					{
						source: record.source,
						anilistId: record.anilistId,
						targets: record.targets,
					},
				],
	);
	const movieIdsWithRadarrTargets = await getMovieIdsWithRadarrTargets(
		provider,
		linkedRecords,
		deps,
	);
	const upstreamBySourceKey = new Map<string, UpstreamTarget[]>();

	for (const record of linkedRecords) {
		const targets = getProviderUpstreamTargets(
			provider,
			record,
			movieIdsWithRadarrTargets,
		);

		if (targets.length > 0) {
			upstreamBySourceKey.set(sourceIdentityKey(record.source), targets);
		}
	}

	return upstreamBySourceKey;
}

function getProviderUpstreamTargets(
	provider: Provider,
	record: SourceUpstreamListRecord,
	movieIdsWithRadarrTargets: ReadonlySet<AniListId>,
): UpstreamTarget[] {
	if (provider === "sonarr" && movieIdsWithRadarrTargets.has(record.anilistId)) {
		return [];
	}

	return record.targets.filter((target) => target.provider === provider);
}

async function getMovieIdsWithRadarrTargets(
	provider: Provider,
	upstreamRecords: readonly SourceUpstreamListRecord[],
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
		entries: [entry],
	});
}

function createTargetKey(result: MappedResult): string {
	return String(result.providerId);
}

function createIdentityKey(provider: Provider, anilistId: AniListId): string {
	return `${provider}:${anilistId}`;
}

function anilistSource(anilistId: AniListId): SourceIdentity {
	return { source: "anilist", id: anilistId };
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
	return Number(left.providerId) - Number(right.providerId);
}

function compareEntries(
	left: { anilistId: AniListId },
	right: { anilistId: AniListId },
): number {
	return Number(left.anilistId) - Number(right.anilistId);
}
