/** RPC handlers for mapping decisions, mapping listings, and detail reads. */
// src/rpc/handlers/mapping.handlers.ts

import {
	anilistMetadataStore,
	bumpLibraryRevision,
	bumpMappingsRevision,
	mappingService,
	radarrLibrary,
	scheduleLibraryRefresh,
	sonarrLibrary,
} from "@/background/api-services";
import { getProviderConfig } from "@/background/provider-config";
import type { AniListId, AniListMediaFormat } from "@/anilist/types";
import {
	getMappingIdentities,
	getMappingList,
} from "@/mapping/list-mappings";
import type { MappingResult, MappingSource } from "@/mapping/types";
import {
	getUniqueAniListIdForSource,
	refreshUpstreamMappings as refreshStoredUpstreamMappings,
} from "@/mapping/upstream.store";
import {
	composeRadarrMappingsLibraryStatus,
	composeSonarrMappingsLibraryStatus,
} from "@/providers/mappings-library-status";
import type { Provider } from "@/providers/types";
import type { RadarrMovieSnapshot } from "@/providers/radarr/types";
import { getProviderExternalIdLabel } from "@/providers/provider-labels";
import {
	getProviderRouteSlug,
	type ProviderRouteSlugSource,
} from "@/providers/provider-route-slug";
import type { SonarrSeriesSnapshot } from "@/providers/sonarr/types";
import { createError } from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";
import { getMappingInspection } from "@/rpc/mapping-inspection";
import { anilistIdFromSource, sourceFromInput } from "@/rpc/source-input";
import type {
	ClearMappingIgnoreInput,
	ClearMappingRejectedCandidateInput,
	ClearManualMappingInput,
	GetMappingIdentitiesInput,
	GetMappingInspectionInput,
	GetMappingsInput,
	GetMappingsOutput,
	MappingListGroup,
	MappingListProviderMeta,
	MappingListRow,
	MappingListRowStatus,
	ProviderExternalId,
	SetMappingIgnoreInput,
	SetMappingRejectedCandidateInput,
	SetManualMappingInput,
} from "@/rpc/types";

const PROVIDERS = ["sonarr", "radarr"] as const satisfies readonly Provider[];

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
		type: "series",
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
		type: "movie",
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

async function buildProviderGroups(provider: Provider): Promise<MappingListGroup[]> {
	const mappingList = await getMappingList(provider, { loadFormatByAniListId });

	if (provider === "sonarr") {
		const status = composeSonarrMappingsLibraryStatus(
			mappingList,
			await loadSonarrLibrary(),
		);

		return [
			...status.mapped.map((group) => {
				const providerMeta = sonarrMeta(group.libraryItem);
				const providerId = group.providerId as ProviderExternalId;
				const rows: MappingListRow[] = group.entries.map((entry) => ({
					source: entry.source,
					anilistId: entry.anilistId,
					provider,
					result: entry.result,
					providerId,
					isInLibrary: group.isInLibrary,
					mappingRowStatus: rowStatus(entry.result, group.isInLibrary),
					...(providerMeta ? { providerMeta } : {}),
				}));

				return {
					key: `${provider}:${group.providerId}`,
					provider,
					providerId,
					rows,
					linkedAniListIds: rows.map((row) => row.anilistId),
					isInLibrary: group.isInLibrary,
					...(providerMeta ? { providerMeta } : {}),
				};
			}),
			...status.ambiguous.map((entry) => {
				const active = entry.activeTarget;
				const providerMeta = sonarrMeta(active?.libraryItem ?? null);
				const providerId = active?.providerId as ProviderExternalId | undefined;
				const isInLibrary = entry.existingTargets.length > 0;
				const row: MappingListRow = {
					source: entry.source,
					anilistId: entry.anilistId,
					provider,
					result: entry.result,
					providerId: providerId ?? null,
					isInLibrary,
					mappingRowStatus: rowStatus(
						entry.result,
						isInLibrary,
						entry.existingTargets.length,
					),
					...(providerMeta ? { providerMeta } : {}),
				};

				return {
					key: `${provider}:ambiguous:${entry.anilistId}`,
					provider,
					providerId: providerId ?? null,
					rows: [row],
					linkedAniListIds: [entry.anilistId],
					isInLibrary: row.isInLibrary,
					...(providerMeta ? { providerMeta } : {}),
				};
			}),
			...status.ignored.map((entry) => {
				const row: MappingListRow = {
					source: entry.source,
					anilistId: entry.anilistId,
					provider,
					result: entry.result,
					providerId: null,
					isInLibrary: false,
					mappingRowStatus: rowStatus(entry.result, false),
				};

				return {
					key: `${provider}:ignored:${entry.anilistId}`,
					provider,
					providerId: null,
					rows: [row],
					linkedAniListIds: [entry.anilistId],
					isInLibrary: false,
				};
			}),
			...status.unmapped.map((entry) => {
				const row: MappingListRow = {
					source: entry.source,
					anilistId: entry.anilistId,
					provider,
					result: entry.result,
					providerId: null,
					isInLibrary: false,
					mappingRowStatus: rowStatus(entry.result, false),
				};

				return {
					key: `${provider}:unmapped:${entry.anilistId}`,
					provider,
					providerId: null,
					rows: [row],
					linkedAniListIds: [entry.anilistId],
					isInLibrary: false,
				};
			}),
		];
	}

	const status = composeRadarrMappingsLibraryStatus(
		mappingList,
		await loadRadarrLibrary(),
	);

	return [
		...status.mapped.map((group) => {
			const providerMeta = radarrMeta(group.libraryItem);
			const providerId = group.providerId as ProviderExternalId;
			const rows: MappingListRow[] = group.entries.map((entry) => ({
				source: entry.source,
				anilistId: entry.anilistId,
				provider,
				result: entry.result,
				providerId,
				isInLibrary: group.isInLibrary,
				mappingRowStatus: rowStatus(entry.result, group.isInLibrary),
				...(providerMeta ? { providerMeta } : {}),
			}));

			return {
				key: `${provider}:${group.providerId}`,
				provider,
				providerId,
				rows,
				linkedAniListIds: rows.map((row) => row.anilistId),
				isInLibrary: group.isInLibrary,
				...(providerMeta ? { providerMeta } : {}),
			};
		}),
		...status.ambiguous.map((entry) => {
			const active = entry.activeTarget;
			const providerMeta = radarrMeta(active?.libraryItem ?? null);
			const providerId = active?.providerId as ProviderExternalId | undefined;
			const isInLibrary = entry.existingTargets.length > 0;
			const row: MappingListRow = {
				source: entry.source,
				anilistId: entry.anilistId,
				provider,
				result: entry.result,
				providerId: providerId ?? null,
				isInLibrary,
				mappingRowStatus: rowStatus(
					entry.result,
					isInLibrary,
					entry.existingTargets.length,
				),
				...(providerMeta ? { providerMeta } : {}),
			};

			return {
				key: `${provider}:ambiguous:${entry.anilistId}`,
				provider,
				providerId: providerId ?? null,
				rows: [row],
				linkedAniListIds: [entry.anilistId],
				isInLibrary: row.isInLibrary,
				...(providerMeta ? { providerMeta } : {}),
			};
		}),
		...status.ignored.map((entry) => {
			const row: MappingListRow = {
				source: entry.source,
				anilistId: entry.anilistId,
				provider,
				result: entry.result,
				providerId: null,
				isInLibrary: false,
				mappingRowStatus: rowStatus(entry.result, false),
			};

			return {
				key: `${provider}:ignored:${entry.anilistId}`,
				provider,
				providerId: null,
				rows: [row],
				linkedAniListIds: [entry.anilistId],
				isInLibrary: false,
			};
		}),
		...status.unmapped.map((entry) => {
			const row: MappingListRow = {
				source: entry.source,
				anilistId: entry.anilistId,
				provider,
				result: entry.result,
				providerId: null,
				isInLibrary: false,
				mappingRowStatus: rowStatus(entry.result, false),
			};

			return {
				key: `${provider}:unmapped:${entry.anilistId}`,
				provider,
				providerId: null,
				rows: [row],
				linkedAniListIds: [entry.anilistId],
				isInLibrary: false,
			};
		}),
	];
}

function matchesQuery(group: MappingListGroup, query: string | undefined): boolean {
	if (!query) return true;

	const normalized = query.toLowerCase();
	if (group.providerMeta?.title?.toLowerCase().includes(normalized)) return true;
	if (String(group.providerId ?? "").includes(normalized)) return true;

	return group.rows.some((row) => {
		if (String(row.anilistId).includes(normalized)) return true;
		if (row.providerMeta?.title?.toLowerCase().includes(normalized)) return true;
		if (String(row.providerId ?? "").includes(normalized)) return true;
		return false;
	});
}

function filterGroups(
	groups: MappingListGroup[],
	statuses: readonly MappingListRowStatus[] | undefined,
	query: string | undefined,
	source: MappingSource | undefined,
): MappingListGroup[] {
	const statusSet = statuses?.length ? new Set(statuses) : null;
	const filteredGroups: MappingListGroup[] = [];

	for (const group of groups) {
		const sourceGroup = filterGroupBySource(group, source);
		if (!sourceGroup) continue;
		if (!matchesQuery(sourceGroup, query)) continue;
		if (
			statusSet &&
			!sourceGroup.rows.some((row) => statusSet.has(row.mappingRowStatus))
		) {
			continue;
		}
		filteredGroups.push(sourceGroup);
	}

	return filteredGroups;
}

function filterGroupBySource(
	group: MappingListGroup,
	source: MappingSource | undefined,
): MappingListGroup | null {
	if (!source) return group;

	const rows = group.rows.filter(
		(row) => row.result.kind === "mapped" && row.result.source === source,
	);
	if (rows.length === 0) return null;

	return {
		...group,
		rows,
		linkedAniListIds: rows.map((row) => row.anilistId),
	};
}

function sortGroups(groups: MappingListGroup[]): MappingListGroup[] {
	return groups.toSorted((left, right) => {
		const providerOrder = left.provider.localeCompare(right.provider);
		if (providerOrder !== 0) return providerOrder;
		return left.key.localeCompare(right.key);
	});
}

async function getMappingsOutput(input?: GetMappingsInput): Promise<GetMappingsOutput> {
	const providers = input?.providers?.length
		? [...new Set(input.providers)]
		: [...PROVIDERS];
	const providerGroups = await Promise.all(
		providers.map((provider) => buildProviderGroups(provider)),
	);
	const allGroups = sortGroups(
		filterGroups(
			providerGroups.flat(),
			input?.statuses,
			input?.query,
			input?.source,
		),
	);
	return {
		groups:
			input?.limit === undefined
				? allGroups
				: allGroups.slice(0, input.limit),
		total: allGroups.length,
	};
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

async function afterMappingWrite(provider: Provider): Promise<void> {
	if (provider === "sonarr" && (await getProviderConfig("sonarr"))) {
		scheduleLibraryRefresh("sonarr");
	}

	await bumpLibraryRevision(provider);
	await bumpMappingsRevision();
}

async function resolveAmbiguousProviderMappings(
	provider: Provider,
): Promise<void> {
	if (!(await getProviderConfig(provider))) return;

	const mappingList = await getMappingList(provider, { loadFormatByAniListId });
	for (const entry of mappingList.ambiguous) {
		await mappingService.resolveMapping(provider, entry.anilistId);
	}
}

async function runMappingRefreshPipeline(): Promise<void> {
	await refreshStoredUpstreamMappings();

	for (const provider of PROVIDERS) {
		await resolveAmbiguousProviderMappings(provider);
	}

	await bumpMappingsRevision();
}

export const mappingHandlers = {
	getMappingIdentities(ids: GetMappingIdentitiesInput) {
		return getMappingIdentities(ids, { mappingService });
	},

	refreshMappingPipeline() {
		return runMappingRefreshPipeline();
	},

	refreshUpstreamMappings() {
		return refreshStoredUpstreamMappings();
	},

	async setManualMapping(input: SetManualMappingInput) {
		const source = sourceFromInput(input);
		await assertNoConflictingLinkedIds({
			provider: input.provider,
			currentAniListId: input.anilistId ?? anilistIdFromSource(source),
			providerId: input.providerId,
			...(input.force === undefined ? {} : { force: input.force }),
		});

		await mappingService.setManualMapping(
			input.provider,
			source,
			input.providerId,
		);
		await afterMappingWrite(input.provider);
		return { ok: true as const };
	},

	async clearManualMapping(input: ClearManualMappingInput) {
		await mappingService.clearManualMapping(input.provider, sourceFromInput(input));
		await afterMappingWrite(input.provider);
		return { ok: true as const };
	},

	async setMappingIgnore(input: SetMappingIgnoreInput) {
		await mappingService.setIgnored(input.provider, sourceFromInput(input));
		await afterMappingWrite(input.provider);
		return { ok: true as const };
	},

	async clearMappingIgnore(input: ClearMappingIgnoreInput) {
		await mappingService.clearIgnored(input.provider, sourceFromInput(input));
		await afterMappingWrite(input.provider);
		return { ok: true as const };
	},

	async setMappingRejectedCandidate(input: SetMappingRejectedCandidateInput) {
		await mappingService.rejectCandidate(
			input.provider,
			sourceFromInput(input),
			input.providerId,
		);
		await afterMappingWrite(input.provider);
		return { ok: true as const };
	},

	async clearMappingRejectedCandidate(input: ClearMappingRejectedCandidateInput) {
		await mappingService.clearRejectedCandidate(
			input.provider,
			sourceFromInput(input),
			input.providerId,
		);
		await afterMappingWrite(input.provider);
		return { ok: true as const };
	},

	getMappings(input?: GetMappingsInput) {
		return getMappingsOutput(input);
	},

	getMappingInspection(input: GetMappingInspectionInput) {
		return getMappingInspection(input, {
			mappingService,
			anilistMetadataStore,
		});
	},

	getAniListIdForSource: getUniqueAniListIdForSource,
};
