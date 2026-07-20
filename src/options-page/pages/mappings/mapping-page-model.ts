/** Pure grouping, filtering, and quick-action helpers for the options mapping page. */
// src/options-page/pages/mappings/mapping-page-model.ts

import {
	parseAniListIdOrNull,
	type AniListId,
	type AniListMetadata,
} from "@/anilist/types";
import {
	sourceIdentityKey,
	type SourceIdentity,
} from "@/mapping/source-identity";
import type { MappingResult, MappingSource } from "@/mapping/types";
import type { Provider } from "@/providers/types";
import {
	getProviderExternalIdLabel,
	getProviderLabel,
} from "@/providers/provider-labels";
import type {
	MappingListGroup,
	MappingListRowStatus,
} from "@/rpc/types";

export type MappingGroup = MappingListGroup;
export type MappingRow = MappingGroup["rows"][number];

export type ProviderFilter = Provider | "all";
export type MappingStatusFilter = MappingListRowStatus | "all";
export type MappingSourceFilter = MappingSource | "all";

export type IgnoreAction =
	| ({ kind: "set-ignore" } & Pick<
			MappingRow,
			"source" | "anilistId" | "provider"
	  >)
	| ({ kind: "clear-ignore" } & Pick<
			MappingRow,
			"source" | "anilistId" | "provider"
	  >);

export type ClearMatchAction =
	| ({ kind: "clear-manual" } & Pick<
			MappingRow,
			"source" | "anilistId" | "provider"
	  >)
	| ({ kind: "reject-candidate"; providerId: number } & Pick<
			MappingRow,
			"source" | "anilistId" | "provider"
	  >)
	| ({ kind: "clear-rejected"; providerId: number } & Pick<
			MappingRow,
			"source" | "anilistId" | "provider"
	  >);

const formatProviderStatus = (status: string | undefined): string | null => {
	if (!status) return null;

	return status
		.replaceAll("_", " ")
		.replaceAll("-", " ")
		.split(" ")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
};

export const isUnmappedMappingGroup = (group: MappingGroup): boolean =>
	group.providerId === null;

export const formatMappingGroupTitle = (group: MappingGroup): string => {
	const first = group.rows[0];
	if (group.providerId === null) {
		return first
			? `${getProviderLabel(group.provider)} AniList #${first.anilistId}`
			: `${getProviderLabel(group.provider)} unmapped target`;
	}
	if (group.providerMeta?.title) return group.providerMeta.title;
	if (first?.providerMeta?.title) return first.providerMeta.title;
	return `${getProviderLabel(group.provider)} target`;
};

export const getMappingGroupMetaPillLabels = (group: MappingGroup): string[] => {
	if (group.providerId === null) {
		return ["No provider target"];
	}

	const labels = [
		`${getProviderExternalIdLabel(group.provider)} ID: ${group.providerId}`,
	];
	const providerType = group.provider === "sonarr" ? "Series" : "Movie";
	const status = formatProviderStatus(group.providerMeta?.statusLabel);
	labels.push(providerType);
	if (status) labels.push(status);
	return labels;
};

export const formatMappingGroupLibraryLabel = (group: MappingGroup): string => {
	if (group.isInLibrary === true) return "In library";
	if (group.isInLibrary === false) return "Not in library";
	return "Library unknown";
};

export const getMetadataById = (
	metadata: readonly AniListMetadata[] | undefined,
): ReadonlyMap<number, AniListMetadata> => {
	const byId = new Map<number, AniListMetadata>();
	for (const item of metadata ?? []) {
		byId.set(item.id, item);
	}
	return byId;
};

export const getTargetSearchValue = (
	targetAniListId: AniListId | null,
): string => (targetAniListId === null ? "" : String(targetAniListId));

interface GetFilteredMappingGroupsInput {
	groups: readonly MappingGroup[];
	provider: ProviderFilter;
	status: MappingStatusFilter;
	source: MappingSourceFilter;
	search: string;
	limit: number;
}

const mappingGroupMatchesSearch = (
	group: MappingGroup,
	search: string,
): boolean => {
	if (search.length === 0) return true;
	if (group.providerMeta?.title?.toLowerCase().includes(search)) return true;
	if (String(group.providerId ?? "").includes(search)) return true;

	return group.rows.some((row) => String(row.anilistId).includes(search));
};

export const getFilteredMappingGroups = ({
	groups,
	provider,
	status,
	source,
	search,
	limit,
}: GetFilteredMappingGroupsInput): {
	groups: MappingGroup[];
	total: number;
} => {
	const normalizedSearch = search.trim().toLowerCase();
	const matchingGroups: MappingGroup[] = [];

	for (const group of groups) {
		if (provider !== "all" && group.provider !== provider) continue;

		const rows =
			source === "all"
				? group.rows
				: group.rows.filter(
						(row) =>
							row.result.kind === "mapped" && row.result.source === source,
					);
		if (rows.length === 0) continue;

		const filteredGroup =
			rows === group.rows
				? group
				: {
						...group,
						rows,
					};

		if (
			status !== "all" &&
			!filteredGroup.rows.some((row) => row.mappingRowStatus === status)
		) {
			continue;
		}
		if (!mappingGroupMatchesSearch(filteredGroup, normalizedSearch)) continue;

		matchingGroups.push(filteredGroup);
	}

	return {
		groups: matchingGroups.slice(0, limit),
		total: matchingGroups.length,
	};
};

export const isMappingGroupExpanded = (
	group: MappingGroup,
	collapsedGroupKeys: ReadonlySet<string>,
	highlightedAniListId: AniListId | null,
): boolean =>
	(highlightedAniListId !== null &&
		group.rows.some((row) => row.anilistId === highlightedAniListId)) ||
	!collapsedGroupKeys.has(group.key);

export const getLoadedMappingRowCount = (
	groups: readonly MappingGroup[],
): number =>
	groups.reduce((count, group) => count + group.rows.length, 0);

export const getVisibleAniListMetadataIds = (input: {
	groups: readonly MappingGroup[];
	collapsedGroupKeys: ReadonlySet<string>;
	highlightedAniListId: AniListId | null;
}): AniListId[] => {
	const visibleAniListIds = new Set<AniListId>();

	for (const group of input.groups) {
		const isExpanded = isMappingGroupExpanded(
			group,
			input.collapsedGroupKeys,
			input.highlightedAniListId,
		);
		if (!isExpanded) continue;

		for (const row of group.rows) {
			visibleAniListIds.add(row.anilistId);
		}
	}

	return [...visibleAniListIds];
};

export const getRowKey = (
	row: Pick<MappingRow, "provider" | "source">,
): string => `${row.provider}:${sourceIdentityKey(row.source)}`;

export const getMappingRowMutationInput = (
	row: MappingRow,
): Pick<MappingRow, "source" | "anilistId" | "provider"> => ({
	source: row.source,
	anilistId: row.anilistId,
	provider: row.provider,
});

export const formatMappingStatusLabel = (
	status: MappingListRowStatus,
): string => {
	switch (status) {
		case "needs-review": {
			return "Needs review";
		}
		case "in-library": {
			return "In library";
		}
		case "can-add": {
			return "Can add";
		}
		case "suppressed": {
			return "Suppressed";
		}
		case "unmapped": {
			return "Unmapped";
		}
		case "unknown": {
			return "Unknown";
		}
	}
};

export const formatMappingEntryKind = (result: MappingResult): string => {
	switch (result.kind) {
		case "mapped": {
			if (result.source === "manual") {
				return "Manual";
			}
			if (result.source === "upstream") {
				return "Upstream";
			}
			return "Auto";
		}
		case "ignored": {
			return "Ignored";
		}
		case "ambiguous": {
			return "Ambiguous";
		}
		case "unmapped": {
			return result.rejectedProviderIds?.length ? "Rejected" : "Unmapped";
		}
	}
};

export const formatSourceIdentity = (source: SourceIdentity): string => {
	if (source.source === "anilist") return `AniList #${source.id}`;
	return `MAL #${source.id}`;
};

export const formatAniListToken = (value: string): string =>
	value.replaceAll("_", " ").replaceAll("-", " ");

export const readTargetAniListIdFromHash = (hash: string): AniListId | null => {
	const queryIndex = hash.indexOf("?");
	if (queryIndex === -1) return null;

	const params = new URLSearchParams(hash.slice(queryIndex + 1));
	return parseAniListIdOrNull(Number(params.get("anilistId")));
};
