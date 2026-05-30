/** Pure grouping, filtering, and quick-action helpers for the options mapping page. */
// src/options-page/pages/mappings/mapping-page-model.ts

import { parseAniListIdOrNull, type AniListId } from "@/anilist";
import type { AniListMetadata } from "@/anilist/schemas/metadata.schema";
import type { MappingListRowStatus } from "@/mapping/queries/list-mappings";
import type { ProviderExternalId } from "@/mapping/types";
import type { Provider } from "@/providers";
import {
	formatProviderExternalId,
	getProviderExternalIdLabel,
	getProviderLabel,
} from "@/providers/provider-labels";
import type { GetMappingsInput } from "@/rpc/schemas";
import type { GetMappingsOutput } from "@/rpc/types";

const GROUP_PAGE_SIZE = 100;

export type MappingGroup = GetMappingsOutput["groups"][number];
export type MappingRow = MappingGroup["rows"][number];

export type ProviderFilter = Provider | "all";
export type MappingStatusFilter = MappingListRowStatus | "all";

export type MappingVirtualItem =
	| {
			kind: "group";
			key: string;
			group: MappingGroup;
			isExpanded: boolean;
	  }
	| {
			kind: "row";
			key: string;
			groupKey: string;
			row: MappingRow;
			isLastInGroup: boolean;
	  };

export type IgnoreAction =
	| { kind: "set-ignore"; anilistId: AniListId; provider: Provider }
	| { kind: "clear-ignore"; anilistId: AniListId; provider: Provider };

export type ClearMatchAction =
	| { kind: "clear-manual"; anilistId: AniListId; provider: Provider }
	| {
			kind: "reject-candidate";
			anilistId: AniListId;
			provider: Provider;
			providerId: ProviderExternalId;
	  }
	| {
			kind: "clear-rejected";
			anilistId: AniListId;
			provider: Provider;
			providerId: ProviderExternalId;
	  };

type ProviderMetaType = NonNullable<MappingRow["providerMeta"]>["type"];

const formatProviderType = (
	type: ProviderMetaType | undefined,
): string | null => {
	if (type === "series") return "Series";
	if (type === "movie") return "Movie";
	return null;
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
	if (group.providerId === null) {
		return "No provider target";
	}
	const providerIdLine = formatProviderExternalId(
		group.provider,
		group.providerId,
	);
	return joinParts([
		providerIdLine,
		formatProviderType(group.providerMeta?.type),
		group.providerMeta?.statusLabel,
	]);
};

export const formatMappingGroupLibraryLabel = (group: MappingGroup): string => {
	if (group.isInLibrary === true) return "In library";
	if (group.isInLibrary === false) return "Not in library";
	return "Library unknown";
};

export const getMappingGroupRowCount = (
	groups: readonly MappingGroup[],
): number => {
	let count = 0;
	for (const group of groups) {
		count += group.rows.length;
	}
	return count;
};

export const flattenMappingPages = (
	pages: readonly { groups: MappingGroup[] }[] | undefined,
): MappingGroup[] => {
	const groups: MappingGroup[] = [];
	for (const page of pages ?? []) {
		groups.push(...page.groups);
	}
	return groups;
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

export const getLoadedAniListIds = (
	groups: readonly MappingGroup[],
): AniListId[] => {
	const ids = new Set<AniListId>();
	for (const group of groups) {
		for (const row of group.rows) {
			ids.add(row.anilistId);
		}
	}
	return [...ids];
};

export const getTargetSearchValue = (
	targetAniListId: AniListId | null,
): string => (targetAniListId === null ? "" : String(targetAniListId));

export const getMappingsInput = (
	provider: ProviderFilter,
	status: MappingStatusFilter,
	search: string,
): GetMappingsInput => {
	const input: NonNullable<GetMappingsInput> = { limit: GROUP_PAGE_SIZE };
	if (provider !== "all") input.providers = [provider];
	if (status !== "all") input.statuses = [status];
	const query = search.trim();
	if (query.length > 0) input.query = query;
	return input;
};

export const isMappingGroupExpanded = (
	group: MappingGroup,
	collapsedGroupKeys: ReadonlySet<string>,
	highlightedAniListId: AniListId | null,
): boolean =>
	(highlightedAniListId !== null &&
		group.rows.some((row) => row.anilistId === highlightedAniListId)) ||
	!collapsedGroupKeys.has(group.key);

export const flattenMappingGroupsForVirtualList = (input: {
	groups: readonly MappingGroup[];
	collapsedGroupKeys: ReadonlySet<string>;
	highlightedAniListId: AniListId | null;
}): MappingVirtualItem[] => {
	const items: MappingVirtualItem[] = [];
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
		if (!isExpanded) continue;
		for (const [index, row] of group.rows.entries()) {
			items.push({
				kind: "row",
				key: `row:${group.key}:${row.provider}:${row.anilistId}`,
				groupKey: group.key,
				row,
				isLastInGroup: index === group.rows.length - 1,
			});
		}
	}
	return items;
};

export const getIgnoreAction = (row: MappingRow): IgnoreAction =>
	row.mappingEntryKind === "ignored"
		? { kind: "clear-ignore", anilistId: row.anilistId, provider: row.provider }
		: { kind: "set-ignore", anilistId: row.anilistId, provider: row.provider };

export const getClearMatchAction = (
	row: MappingRow,
): ClearMatchAction | null => {
	if (row.mappingEntryKind === "manual") {
		return {
			kind: "clear-manual",
			anilistId: row.anilistId,
			provider: row.provider,
		};
	}

	if (row.mappingEntryKind === "auto" && row.providerId !== null) {
		return {
			kind: "reject-candidate",
			anilistId: row.anilistId,
			provider: row.provider,
			providerId: row.providerId,
		};
	}

	if (
		row.mappingEntryKind === "rejected" &&
		typeof row.suppressedProviderId === "number"
	) {
		return {
			kind: "clear-rejected",
			anilistId: row.anilistId,
			provider: row.provider,
			providerId: row.suppressedProviderId,
		};
	}

	return null;
};

export const getRowKey = (
	row: Pick<MappingRow, "provider" | "anilistId">,
): string => `${row.provider}:${row.anilistId}`;

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

export const formatMappingEntryKind = (
	kind: MappingRow["mappingEntryKind"],
): string => {
	switch (kind) {
		case "manual": {
			return "Manual";
		}
		case "upstream": {
			return "Upstream";
		}
		case "auto": {
			return "Auto";
		}
		case "ignored": {
			return "Ignored";
		}
		case "rejected": {
			return "Rejected";
		}
		case "unmapped": {
			return "Unmapped";
		}
		case "unknown": {
			return "Unknown";
		}
	}
};

export const formatAniListToken = (value: string): string =>
	value.replaceAll("_", " ").replaceAll("-", " ");

export const formatProviderIdLabel = (
	provider: Provider,
	providerId: ProviderExternalId | null,
): string =>
	providerId === null
		? `${getProviderExternalIdLabel(provider)} unknown`
		: formatProviderExternalId(provider, providerId);

export const readTargetAniListIdFromHash = (hash: string): AniListId | null => {
	const queryIndex = hash.indexOf("?");
	if (queryIndex === -1) return null;

	const params = new URLSearchParams(hash.slice(queryIndex + 1));
	return parseAniListIdOrNull(Number(params.get("anilistId")));
};
