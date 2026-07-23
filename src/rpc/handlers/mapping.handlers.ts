/** RPC handlers for mapping decisions, mapping listings, and detail reads. */
// src/rpc/handlers/mapping.handlers.ts

import {
	anilistMetadataStore,
	mappingService,
	radarrLibrary,
	sonarrLibrary,
} from "@/background/api-services";
import { getProviderConfig } from "@/background/provider-config";
import type { AniListId, AniListMediaFormat } from "@/anilist/types";
import {
	getMappingIdentities,
	listEffectiveMappingRecordsByProvider,
} from "@/mapping/list-mappings";
import type { EffectiveMappingRecord } from "@/mapping/mapping-facts";
import type { MappingResult } from "@/mapping/types";
import type { SourceIdentity } from "@/mapping/source-identity";
import {
	getSourceAliasesByAniListId,
	getUniqueAniListIdsForSources,
} from "@/mapping/upstream.store";
import type { Provider } from "@/providers/types";
import type { RadarrMovieSnapshot } from "@/providers/radarr/types";
import { getProviderExternalIdLabel } from "@/providers/provider-labels";
import {
	getProviderRouteSlug,
	type ProviderRouteSlugSource,
} from "@/providers/provider-route-slug";
import { parseTmdbIdOrNull, parseTvdbIdOrNull } from "@/providers/schemas";
import type { SonarrSeriesSnapshot } from "@/providers/sonarr/types";
import { createError } from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";
import { bumpMappingsRevision } from "@/rpc/revision-signals";
import { getMappingInspection } from "@/rpc/mapping-inspection";
import { requireAniListIdFromInput } from "@/rpc/source-input";
import type {
	ClearMappingIgnoreInput,
	ClearMappingRejectedCandidateInput,
	ClearManualMappingInput,
	GetMappingIdentitiesInput,
	GetMappingInspectionInput,
	MappingListGroup,
	MappingListProviderMeta,
	MappingListRow,
	MappingListRowStatus,
	ProviderExternalId,
	SetMappingIgnoreInput,
	SetMappingRejectedCandidateInput,
	SetManualMappingInput,
} from "@/rpc/types";

type ProviderMetaSource = {
	title: string;
	status?: string | null | undefined;
} & ProviderRouteSlugSource;

async function loadSonarrLibrary(): Promise<SonarrSeriesSnapshot[]> {
	const credentials = await getProviderConfig("sonarr");
	if (!credentials) {
		return [];
	}

	return sonarrLibrary.getSeriesSnapshots(credentials);
}

async function loadRadarrLibrary(): Promise<RadarrMovieSnapshot[]> {
	const credentials = await getProviderConfig("radarr");
	if (!credentials) {
		return [];
	}

	return radarrLibrary.getMovieSnapshots(credentials);
}

async function loadFormatByAniListId(
	ids: readonly AniListId[],
): Promise<ReadonlyMap<AniListId, AniListMediaFormat | null>> {
	const result = await anilistMetadataStore.getMetadata([...ids]);
	const formatByAniListId = new Map<AniListId, AniListMediaFormat | null>();

	for (const metadata of result.metadata) {
		formatByAniListId.set(metadata.id, metadata.format ?? null);
	}

	return formatByAniListId;
}

function sonarrMeta(
	item: ProviderMetaSource | null,
): MappingListProviderMeta | undefined {
	if (!item) return undefined;
	const providerRouteSlug = getProviderRouteSlug("sonarr", item);
	return {
		title: item.title,
		...(typeof item.status === "string" ? { statusLabel: item.status } : {}),
		...(providerRouteSlug ? { providerRouteSlug } : {}),
	};
}

function radarrMeta(
	item: ProviderMetaSource | null,
): MappingListProviderMeta | undefined {
	if (!item) return undefined;
	const providerRouteSlug = getProviderRouteSlug("radarr", item);
	return {
		title: item.title,
		...(typeof item.status === "string" ? { statusLabel: item.status } : {}),
		...(providerRouteSlug ? { providerRouteSlug } : {}),
	};
}

function mappedRowStatus(isInLibrary: boolean | null): MappingListRowStatus {
	if (isInLibrary === true) return "in-library";
	if (isInLibrary === false) return "can-add";
	return "unknown";
}

function rowStatus(
	result: MappingResult,
	isInLibrary: boolean | null,
	existingTargetCount = 0,
): MappingListRowStatus {
	switch (result.kind) {
		case "mapped": {
			return mappedRowStatus(isInLibrary);
		}
		case "ignored": {
			return "suppressed";
		}
		case "ambiguous": {
			return existingTargetCount === 1 ? "in-library" : "needs-review";
		}
		case "unmapped": {
			return result.rejectedProviderIds?.length ? "suppressed" : "unmapped";
		}
	}
}

function groupMappedRecords(
	records: readonly EffectiveMappingRecord[],
): ReadonlyMap<number, EffectiveMappingRecord[]> {
	const groups = new Map<number, EffectiveMappingRecord[]>();

	for (const record of records) {
		if (record.result.kind !== "mapped") continue;

		const group = groups.get(record.result.providerId) ?? [];
		group.push(record);
		groups.set(record.result.providerId, group);
	}

	return groups;
}

function composeRow(
	record: EffectiveMappingRecord,
	isInLibrary: boolean | null,
	aliasesByAniListId: ReadonlyMap<AniListId, SourceIdentity[]>,
	options?: {
		existingTargetCount?: number;
		providerMeta?: MappingListProviderMeta;
	},
): MappingListRow | null {
	const providerMeta = options?.providerMeta;
	const aliases = aliasesByAniListId.get(record.anilistId);

	return {
		anilistId: record.anilistId,
		...(aliases?.length ? { aliases } : {}),
		provider: record.provider,
		result: record.result,
		mappingRowStatus: rowStatus(
			record.result,
			isInLibrary,
			options?.existingTargetCount,
		),
		...(providerMeta ? { providerMeta } : {}),
	};
}

function composeMappedGroup(
	provider: Provider,
	providerId: ProviderExternalId,
	records: readonly EffectiveMappingRecord[],
	options: {
		aliasesByAniListId: ReadonlyMap<AniListId, SourceIdentity[]>;
		isInLibrary: boolean;
		providerMeta?: MappingListProviderMeta;
	},
): MappingListGroup {
	const rows = records.toSorted(compareEffectiveRecords).flatMap((record) => {
		const row = composeRow(
			record,
			options.isInLibrary,
			options.aliasesByAniListId,
			{
				...(options.providerMeta ? { providerMeta: options.providerMeta } : {}),
			},
		);
		return row === null ? [] : [row];
	});

	return {
		key: `${provider}:${providerId}`,
		provider,
		providerId,
		rows,
		isInLibrary: options.isInLibrary,
		...(options.providerMeta ? { providerMeta: options.providerMeta } : {}),
	};
}

function composeAmbiguousGroup(
	record: EffectiveMappingRecord,
	providerId: ProviderExternalId | null,
	options: {
		existingTargetCount: number;
		aliasesByAniListId: ReadonlyMap<AniListId, SourceIdentity[]>;
		providerMeta?: MappingListProviderMeta;
	},
): MappingListGroup | null {
	const isInLibrary = options.existingTargetCount > 0;
	const row = composeRow(record, isInLibrary, options.aliasesByAniListId, {
		existingTargetCount: options.existingTargetCount,
		...(options.providerMeta ? { providerMeta: options.providerMeta } : {}),
	});
	if (row === null) return null;

	return {
		key: `${record.provider}:ambiguous:anilist:${record.anilistId}`,
		provider: record.provider,
		providerId,
		rows: [row],
		isInLibrary,
		...(options.providerMeta ? { providerMeta: options.providerMeta } : {}),
	};
}

function composeStandaloneGroup(
	record: EffectiveMappingRecord,
	aliasesByAniListId: ReadonlyMap<AniListId, SourceIdentity[]>,
): MappingListGroup | null {
	if (record.result.kind !== "ignored" && record.result.kind !== "unmapped") {
		return null;
	}

	const row = composeRow(record, false, aliasesByAniListId);
	if (row === null) return null;

	return {
		key: `${record.provider}:${record.result.kind}:anilist:${record.anilistId}`,
		provider: record.provider,
		providerId: null,
		rows: [row],
		isInLibrary: false,
	};
}

function buildSonarrGroups(
	records: readonly EffectiveMappingRecord[],
	library: readonly SonarrSeriesSnapshot[],
	aliasesByAniListId: ReadonlyMap<AniListId, SourceIdentity[]>,
): MappingListGroup[] {
	const libraryByTvdbId = new Map(
		library.map((series) => [Number(series.tvdbId), series] as const),
	);
	const groups = [...groupMappedRecords(records)].flatMap(
		([rawProviderId, mappedRecords]) => {
			const providerId = parseTvdbIdOrNull(rawProviderId);
			if (providerId === null) return [];

			const libraryItem = libraryByTvdbId.get(providerId) ?? null;
			const providerMeta = sonarrMeta(libraryItem);
			return [
				composeMappedGroup("sonarr", providerId, mappedRecords, {
					aliasesByAniListId,
					isInLibrary: libraryItem !== null,
					...(providerMeta ? { providerMeta } : {}),
				}),
			];
		},
	);

	for (const record of records) {
		if (record.result.kind === "ambiguous") {
			const existingTargets = record.result.targets.flatMap((target) => {
				if (target.provider !== "sonarr") return [];
				const providerId = parseTvdbIdOrNull(target.providerId);
				if (providerId === null) return [];
				const libraryItem = libraryByTvdbId.get(providerId);
				return libraryItem === undefined ? [] : [{ providerId, libraryItem }];
			});
			const activeTarget =
				existingTargets.length === 1 ? (existingTargets[0] ?? null) : null;
			const providerMeta = sonarrMeta(activeTarget?.libraryItem ?? null);
			const group = composeAmbiguousGroup(
				record,
				activeTarget?.providerId ?? null,
				{
					existingTargetCount: existingTargets.length,
					aliasesByAniListId,
					...(providerMeta ? { providerMeta } : {}),
				},
			);
			if (group) groups.push(group);
			continue;
		}

		const group = composeStandaloneGroup(record, aliasesByAniListId);
		if (group) groups.push(group);
	}

	return groups;
}

function buildRadarrGroups(
	records: readonly EffectiveMappingRecord[],
	library: readonly RadarrMovieSnapshot[],
	aliasesByAniListId: ReadonlyMap<AniListId, SourceIdentity[]>,
): MappingListGroup[] {
	const libraryByTmdbId = new Map(
		library.map((movie) => [Number(movie.tmdbId), movie] as const),
	);
	const groups = [...groupMappedRecords(records)].flatMap(
		([rawProviderId, mappedRecords]) => {
			const providerId = parseTmdbIdOrNull(rawProviderId);
			if (providerId === null) return [];

			const libraryItem = libraryByTmdbId.get(providerId) ?? null;
			const providerMeta = radarrMeta(libraryItem);
			return [
				composeMappedGroup("radarr", providerId, mappedRecords, {
					aliasesByAniListId,
					isInLibrary: libraryItem !== null,
					...(providerMeta ? { providerMeta } : {}),
				}),
			];
		},
	);

	for (const record of records) {
		if (record.result.kind === "ambiguous") {
			const existingTargets = record.result.targets.flatMap((target) => {
				if (target.provider !== "radarr") return [];
				const providerId = parseTmdbIdOrNull(target.providerId);
				if (providerId === null) return [];
				const libraryItem = libraryByTmdbId.get(providerId);
				return libraryItem === undefined ? [] : [{ providerId, libraryItem }];
			});
			const activeTarget =
				existingTargets.length === 1 ? (existingTargets[0] ?? null) : null;
			const providerMeta = radarrMeta(activeTarget?.libraryItem ?? null);
			const group = composeAmbiguousGroup(
				record,
				activeTarget?.providerId ?? null,
				{
					existingTargetCount: existingTargets.length,
					aliasesByAniListId,
					...(providerMeta ? { providerMeta } : {}),
				},
			);
			if (group) groups.push(group);
			continue;
		}

		const group = composeStandaloneGroup(record, aliasesByAniListId);
		if (group) groups.push(group);
	}

	return groups;
}

function compareEffectiveRecords(
	left: EffectiveMappingRecord,
	right: EffectiveMappingRecord,
): number {
	return left.anilistId - right.anilistId;
}

function sortGroups(groups: MappingListGroup[]): MappingListGroup[] {
	return groups.toSorted((left, right) => {
		const providerOrder = left.provider.localeCompare(right.provider);
		if (providerOrder !== 0) return providerOrder;
		return left.key.localeCompare(right.key);
	});
}

async function getMappingsOutput(): Promise<MappingListGroup[]> {
	const [
		recordsByProvider,
		sonarrLibraryItems,
		radarrLibraryItems,
		aliasesByAniListId,
	] = await Promise.all([
		listEffectiveMappingRecordsByProvider({ loadFormatByAniListId }),
		loadSonarrLibrary(),
		loadRadarrLibrary(),
		getSourceAliasesByAniListId(),
	]);

	return sortGroups([
		...buildSonarrGroups(
			recordsByProvider.sonarr,
			sonarrLibraryItems,
			aliasesByAniListId,
		),
		...buildRadarrGroups(
			recordsByProvider.radarr,
			radarrLibraryItems,
			aliasesByAniListId,
		),
	]);
}

async function assertNoConflictingLinkedIds(input: {
	provider: Provider;
	currentAniListId: AniListId | null;
	providerId: ProviderExternalId;
	force?: boolean;
}): Promise<void> {
	const linkedIds = await mappingService.getLinkedAniListIds(
		input.provider,
		input.providerId,
	);
	const conflictingAniListIds = linkedIds.filter(
		(id) => id !== input.currentAniListId,
	);

	if (conflictingAniListIds.length === 0 || input.force) return;

	const idLabel = getProviderExternalIdLabel(input.provider);
	throw createError(
		ErrorCode.VALIDATION_ERROR,
		`${idLabel} ID ${input.providerId} is already linked to other AniList entries.`,
		`This ${idLabel} ID is already linked to other AniList entries. Confirm if you want to share it.`,
		{ conflictingAniListIds },
	);
}

export const mappingHandlers = {
	getMappingIdentities(ids: GetMappingIdentitiesInput) {
		return getMappingIdentities(ids);
	},

	async setManualMapping(input: SetManualMappingInput) {
		const anilistId = await requireAniListIdFromInput(input);
		await assertNoConflictingLinkedIds({
			provider: input.provider,
			currentAniListId: anilistId,
			providerId: input.providerId,
			...(input.force === undefined ? {} : { force: input.force }),
		});

		await mappingService.setManualMapping(
			input.provider,
			anilistId,
			input.providerId,
		);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async clearManualMapping(input: ClearManualMappingInput) {
		const anilistId = await requireAniListIdFromInput(input);
		await mappingService.clearManualMapping(input.provider, anilistId);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async setMappingIgnore(input: SetMappingIgnoreInput) {
		const anilistId = await requireAniListIdFromInput(input);
		await mappingService.setIgnored(input.provider, anilistId);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async clearMappingIgnore(input: ClearMappingIgnoreInput) {
		const anilistId = await requireAniListIdFromInput(input);
		await mappingService.clearIgnored(input.provider, anilistId);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async setMappingRejectedCandidate(input: SetMappingRejectedCandidateInput) {
		const anilistId = await requireAniListIdFromInput(input);
		await mappingService.rejectCandidate(
			input.provider,
			anilistId,
			input.providerId,
		);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async clearMappingRejectedCandidate(
		input: ClearMappingRejectedCandidateInput,
	) {
		const anilistId = await requireAniListIdFromInput(input);
		await mappingService.clearRejectedCandidate(
			input.provider,
			anilistId,
			input.providerId,
		);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	getMappings() {
		return getMappingsOutput();
	},

	getMappingInspection(input: GetMappingInspectionInput) {
		return getMappingInspection(input, {
			mappingService,
			anilistMetadataStore,
		});
	},

	async resolveAniListIdsForSources(sources: SourceIdentity[]) {
		return getUniqueAniListIdsForSources(sources);
	},
};
