/** Filters, sorts, and limits cached mapping groups. */
// src/mapping/queries/list-mapping-filtering.ts

import type { EffectiveMappingKind } from "@/mapping/types";
import type {
	ListMappingsInput,
	MappingListGroup,
	MappingListRow,
	MappingListRowStatus,
} from "./list-mapping-types";

export interface NormalizedListMappingsInput {
	query: string;
	entryKinds: Set<EffectiveMappingKind> | null;
	statuses: Set<MappingListRowStatus> | null;
	limit: number;
}

export function normalizeListMappingsInput(
	input: ListMappingsInput | undefined,
): NormalizedListMappingsInput {
	return {
		query: input?.query?.trim().toLowerCase() ?? "",
		entryKinds: input?.entryKinds?.length ? new Set(input.entryKinds) : null,
		statuses: input?.statuses?.length ? new Set(input.statuses) : null,
		limit: Math.min(Math.max(input?.limit ?? 100, 1), 100),
	};
}

function matchesQuery(row: MappingListRow, query: string): boolean {
	return [
		row.anilistId,
		row.provider,
		row.providerId ?? "",
		row.suppressedProviderId ?? "",
		row.mappingRowStatus,
		row.mappingEntryKind,
		row.providerMappingState,
		row.mappingSource ?? "",
		row.mappingReason ?? "",
		row.mappingUnknownReason ?? "",
		row.providerMeta?.title ?? "",
	]
		.join(" ")
		.toLowerCase()
		.includes(query);
}

export function filterMappingGroups(
	groups: readonly MappingListGroup[],
	input: NormalizedListMappingsInput,
): {
	groups: MappingListGroup[];
	total: number;
} {
	const filtered = groups
		.filter((group) => {
			if (
				input.entryKinds &&
				!group.rows.some((row) => input.entryKinds?.has(row.mappingEntryKind))
			) {
				return false;
			}

			if (
				input.statuses &&
				!group.rows.some((row) => input.statuses?.has(row.mappingRowStatus))
			) {
				return false;
			}

			if (!input.query) {
				return true;
			}

			const groupText = [
				group.key,
				group.provider,
				group.providerId ?? "",
				group.providerMeta?.title ?? "",
				group.providerMeta?.type ?? "",
				group.providerMeta?.statusLabel ?? "",
				...group.linkedAniListIds,
			]
				.join(" ")
				.toLowerCase();

			return (
				groupText.includes(input.query) ||
				group.rows.some((row) => matchesQuery(row, input.query))
			);
		})
		.toSorted(
			(left, right) =>
				right.updatedAt - left.updatedAt || left.key.localeCompare(right.key),
		);

	return {
		groups: filtered.slice(0, input.limit),
		total: filtered.length,
	};
}
