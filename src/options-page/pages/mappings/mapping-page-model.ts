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
	GetMappingsOutput,
	MappingListRowStatus,
	ProviderExternalId,
} from "@/rpc/types";

export type MappingGroup = GetMappingsOutput["groups"][number];
export type MappingRow = MappingGroup["rows"][number];

export type ProviderFilter = Provider | "all";
export type MappingStatusFilter = MappingListRowStatus | "all";
export type MappingSourceFilter = MappingSource | "all";

export type MappingListItem =
	| {
			kind: "group";
			key: string;
			group: MappingGroup;
			isExpanded: boolean;
	  }
	| {
			kind: "row";
			key: string;
			row: MappingRow;
			parentProviderId: ProviderExternalId | null;
			isLastInGroup: boolean;
	  };

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

type ProviderMetaType = NonNullable<MappingRow["providerMeta"]>["type"];

const formatProviderType = (
	type: ProviderMetaType | undefined,
): string | null => {
	if (type === "series") return "Series";
	if (type === "movie") return "Movie";
	return null;
};

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

const joinParts = (parts: Array<string | null | undefined>): string => {
	const values: string[] = [];
	for (const part of parts) {
		if (part) {
			values.push(part);
		}
	}
	return values.join(" • ");
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

export const formatMappingGroupMetaLine = (group: MappingGroup): string => {
	return joinParts(getMappingGroupMetaPillLabels(group));
};

export const getMappingGroupMetaPillLabels = (group: MappingGroup): string[] => {
	if (group.providerId === null) {
		return ["No provider target"];
	}

	const labels = [
		`${getProviderExternalIdLabel(group.provider)} ID: ${group.providerId}`,
	];
	const providerType = formatProviderType(group.providerMeta?.type);
	const status = formatProviderStatus(group.providerMeta?.statusLabel);
	if (providerType) labels.push(providerType);
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

	return group.rows.some((row) => {
		if (String(row.anilistId).includes(search)) return true;
		if (row.providerMeta?.title?.toLowerCase().includes(search)) return true;
		if (String(row.providerId ?? "").includes(search)) return true;
		return false;
	});
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
						linkedAniListIds: rows.map((row) => row.anilistId),
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

export const getMappingListModel = (input: {
	groups: readonly MappingGroup[];
	collapsedGroupKeys: ReadonlySet<string>;
	highlightedAniListId: AniListId | null;
}): {
	items: MappingListItem[];
	loadedRowCount: number;
	visibleAniListIds: AniListId[];
} => {
	const items: MappingListItem[] = [];
	const visibleAniListIds = new Set<AniListId>();
	let loadedRowCount = 0;

	for (const group of input.groups) {
		const isExpanded = isMappingGroupExpanded(
			group,
			input.collapsedGroupKeys,
			input.highlightedAniListId,
		);
		items.push({
			kind: "group",
			key: `group:${group.key}`,
			group,
			isExpanded,
		});
		loadedRowCount += group.rows.length;
		if (!isExpanded) continue;

		for (const [index, row] of group.rows.entries()) {
			items.push({
				kind: "row",
				key: `row:${group.key}:${row.provider}:${sourceIdentityKey(row.source)}`,
				row,
				parentProviderId: group.providerId,
				isLastInGroup: index === group.rows.length - 1,
			});
			visibleAniListIds.add(row.anilistId);
		}
	}

	return {
		items,
		loadedRowCount,
		visibleAniListIds: [...visibleAniListIds],
	};
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
