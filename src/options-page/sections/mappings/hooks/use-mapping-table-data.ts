/** Derives mapping table rows, metadata joins, and filter state for the options mappings UI. */
// src/options-page/sections/mappings/hooks/use-mapping-table-data.ts

import { useMemo } from "react";
import { useDebounced } from "@/shared/hooks/use-debounced";
import { useAniListMetadataBatch, useMappings } from "@/queries";
import type { AniListId } from "@/anilist";
import { PROVIDERS, type Provider } from "@/providers";
import { formatProviderExternalId } from "@/providers/provider-labels";
import {
	createProviderMappingTarget,
	type EffectiveMappingKind,
} from "@/mapping/types";
import type { MappingListRow } from "@/mapping/queries/list-mappings";
import type { GetAniListMetadataOutput, GetMappingsOutput } from "@/rpc/types";
import type { GetMappingsInput } from "@/rpc/schemas";
import type { MappingTableRowData } from "../components/mapping-table";
import type {
	EntryKindFilterSet,
	LibraryFilter,
	MappingSort,
} from "../components/mapping-toolbar";
import { normalizeMappingSearchQuery } from "../search-query";

type UseMappingTableDataParams = {
	providerFilters: Set<Provider>;
	entryKindFilters: EntryKindFilterSet;
	searchQuery: string;
	libraryFilter: LibraryFilter;
	sortOption: MappingSort;
	limitOverride?: number;
};

export const useMappingTableData = ({
	providerFilters,
	entryKindFilters,
	searchQuery,
	libraryFilter,
	sortOption,
	limitOverride,
}: UseMappingTableDataParams) => {
	const debouncedQuery = useDebounced(searchQuery, 250);

	const providersToQuery = useMemo<Provider[]>(() => {
		const arr = [...providerFilters];
		if (arr.length === 0) return [...PROVIDERS];
		return arr.toSorted() as Provider[];
	}, [providerFilters]);

	const mappingQueryInput = useMemo<GetMappingsInput>(() => {
		const normalizedQuery = normalizeMappingSearchQuery(debouncedQuery);
		const entryKinds: NonNullable<NonNullable<GetMappingsInput>["entryKinds"]> =
			entryKindFilters.size > 0
				? [...entryKindFilters]
				: [
						"manual",
						"rejected",
						"ignored",
						"unmapped",
						"unknown",
						"auto",
						"upstream",
					];
		return {
			providers: providersToQuery,
			entryKinds,
			limit: limitOverride ?? (normalizedQuery ? 200 : 500),
			...(normalizedQuery ? { query: normalizedQuery } : {}),
		};
	}, [debouncedQuery, entryKindFilters, limitOverride, providersToQuery]);

	const mappings = useMappings(mappingQueryInput);
	const mappingPages = useMemo<GetMappingsOutput[]>(
		() => mappings.data?.pages ?? [],
		[mappings.data?.pages],
	);
	const totalAvailable = mappingPages[0]?.total;
	const mappingEntries = useMemo<GetMappingsOutput["mappings"][number][]>(
		() => mappingPages.flatMap((page) => page.mappings),
		[mappingPages],
	);

	const metadataIds = useMemo(
		() => [...new Set(mappingEntries.map((entry) => entry.anilistId))],
		[mappingEntries],
	);
	const metadata = useAniListMetadataBatch(metadataIds, {
		enabled: metadataIds.length > 0,
	});
	const metadataMap = useMemo(() => {
		const map = new Map<
			AniListId,
			GetAniListMetadataOutput["metadata"][number]
		>();
		for (const entry of metadata.data?.metadata ?? []) {
			map.set(entry.id, entry);
		}
		return map;
	}, [metadata.data?.metadata]);

	type EntryRow = { entry: MappingListRow; title: string; haystack: string };

	const entryRows = useMemo<EntryRow[]>(() => {
		return mappingEntries.map((entry: MappingListRow) => {
			const meta = metadataMap.get(entry.anilistId);
			const title =
				meta?.titles?.english ||
				meta?.titles?.romaji ||
				meta?.titles?.native ||
				entry.providerMeta?.title ||
				`AniList #${entry.anilistId}`;
			const haystackParts = [
				String(entry.anilistId),
				entry.providerId === null ? "" : String(entry.providerId),
				entry.suppressedProviderId == null
					? ""
					: String(entry.suppressedProviderId),
				entry.mappingRowStatus,
				entry.mappingEntryKind,
				entry.providerMappingState,
				entry.mappingSource ?? "",
				entry.mappingReason ?? "",
				entry.mappingUnknownReason ?? "",
				entry.libraryUnknownReason ?? "",
				title.toLowerCase(),
				entry.providerId === null
					? ""
					: (entry.providerMeta?.title?.toLowerCase() ?? ""),
				...(entry.reviewSummary?.reasons ?? []),
				meta?.titles?.english?.toLowerCase() ?? "",
				meta?.titles?.romaji?.toLowerCase() ?? "",
				meta?.titles?.native?.toLowerCase() ?? "",
			].filter(Boolean);
			return { entry, title, haystack: haystackParts.join(" ") };
		});
	}, [mappingEntries, metadataMap]);

	const filteredEntryRows = useMemo(() => {
		if (libraryFilter === "all") return entryRows;
		const predicate =
			libraryFilter === "in-library"
				? (entry: MappingListRow) =>
						entry.providerMappingState === "mapped" &&
						entry.isInLibrary === true
				: (entry: MappingListRow) =>
						entry.providerMappingState === "mapped" &&
						entry.isInLibrary === false;
		return entryRows.filter(({ entry }) => predicate(entry));
	}, [entryRows, libraryFilter]);

	const tableRows = useMemo<MappingTableRowData[]>(() => {
		type Group = Omit<MappingTableRowData, "entryKinds"> & {
			sortIndex: number;
			entryKinds: Set<EffectiveMappingKind>;
		};

		type NormalizedRow = MappingTableRowData & { sortIndex: number };

		const groups = new Map<string, Group>();
		let order = 0;

		for (const { entry, title } of filteredEntryRows) {
			const key =
				entry.providerId === null
					? `${entry.provider}:unmapped:${entry.anilistId}`
					: `${entry.provider}:${entry.providerId}`;

			const existingGroup = groups.get(key);
			if (existingGroup) {
				if (existingGroup.providerMeta === undefined && entry.providerMeta) {
					existingGroup.providerMeta = entry.providerMeta;
				}
				if (typeof entry.updatedAt === "number") {
					existingGroup.updatedAt = Math.max(
						existingGroup.updatedAt ?? 0,
						entry.updatedAt,
					);
				}
				existingGroup.entries.push({
					entry,
					title,
					metadata: metadataMap.get(entry.anilistId),
				});
				existingGroup.entryKinds.add(entry.mappingEntryKind);
			} else {
				const newGroup: Group = {
					id: key,
					provider: entry.provider,
					providerId: entry.providerId ?? null,
					providerIdentity:
						entry.providerId == null
							? null
							: createProviderMappingTarget(entry.provider, entry.providerId),
					providerMeta: entry.providerMeta,
					entries: [],
					entryKinds: new Set<EffectiveMappingKind>(),
					sortIndex: order++,
				};
				if (entry.updatedAt !== undefined) {
					newGroup.updatedAt = entry.updatedAt;
				}
				newGroup.entries.push({
					entry,
					title,
					metadata: metadataMap.get(entry.anilistId),
				});
				newGroup.entryKinds.add(entry.mappingEntryKind);
				groups.set(key, newGroup);
			}
		}

		const entryKindPriority: Record<EffectiveMappingKind, number> = {
			manual: 0,
			unmapped: 1,
			unknown: 2,
			rejected: 3,
			ignored: 4,
			upstream: 5,
			auto: 6,
		};

		const resolveTitle = (row: MappingTableRowData) => {
			const fallback =
				row.providerIdentity === null
					? "Unmapped"
					: formatProviderExternalId(
							row.providerIdentity.provider,
							row.providerIdentity.providerId,
						);
			return row.providerMeta?.title ?? row.entries[0]?.title ?? fallback;
		};

		const getEntryKindRank = (entryKinds: EffectiveMappingKind[]) => {
			if (entryKinds.length === 0) return Number.MAX_SAFE_INTEGER;
			return Math.min(
				...entryKinds.map(
					(entryKind) =>
						entryKindPriority[entryKind] ?? Number.MAX_SAFE_INTEGER,
				),
			);
		};

		const getLinkedStats = (row: MappingTableRowData) => {
			let inLibraryCount = 0;
			for (const { entry } of row.entries) {
				if (entry.isInLibrary === true) {
					inLibraryCount += 1;
				}
			}
			return { linked: row.entries.length, inLibraryCount };
		};

		const compareTitles = (a: NormalizedRow, b: NormalizedRow) => {
			const diff = resolveTitle(a).localeCompare(resolveTitle(b));
			return diff === 0 ? a.sortIndex - b.sortIndex : diff;
		};

		const rows: NormalizedRow[] = [...groups.values()].map((group) => ({
			...group,
			entries: group.entries.toSorted((a, b) => a.title.localeCompare(b.title)),
			entryKinds: [...group.entryKinds],
		}));

		const sortedRows = rows.toSorted((a, b) => {
			switch (sortOption) {
				case "title-asc": {
					return compareTitles(a, b);
				}
				case "title-desc": {
					return compareTitles(b, a);
				}
				case "updated-asc": {
					const diff =
						(a.updatedAt ?? Number.POSITIVE_INFINITY) -
						(b.updatedAt ?? Number.POSITIVE_INFINITY);
					if (diff !== 0) return diff;
					return compareTitles(a, b);
				}
				case "updated-desc": {
					const diff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
					if (diff !== 0) return diff;
					return compareTitles(a, b);
				}
				case "linked-desc":
				case "linked-asc": {
					const statsA = getLinkedStats(a);
					const statsB = getLinkedStats(b);
					const linkedDiff = statsB.linked - statsA.linked;
					if (linkedDiff !== 0)
						return sortOption === "linked-desc" ? linkedDiff : -linkedDiff;
					const libraryDiff = statsB.inLibraryCount - statsA.inLibraryCount;
					if (libraryDiff !== 0)
						return sortOption === "linked-desc" ? libraryDiff : -libraryDiff;
					return compareTitles(a, b);
				}
				case "source": {
					const rankA = getEntryKindRank(a.entryKinds);
					const rankB = getEntryKindRank(b.entryKinds);
					if (rankA !== rankB) return rankA - rankB;
					return compareTitles(a, b);
				}
				default: {
					return a.sortIndex - b.sortIndex;
				}
			}
		});

		return sortedRows.map(({ sortIndex, ...rest }) => {
			void sortIndex;
			return rest;
		});
	}, [filteredEntryRows, metadataMap, sortOption]);

	const loadedCount = tableRows.length;

	const emptyCopy = useMemo(() => {
		if (tableRows.length === 0 && debouncedQuery.length > 0) {
			return "No results match this search.";
		}
		if (tableRows.length === 0 && libraryFilter === "in-library") {
			return "No mappings are in your library yet.";
		}
		if (tableRows.length === 0 && libraryFilter === "not-in-library") {
			return "No mappings are missing from your library right now.";
		}
		return "No mappings to show yet.";
	}, [debouncedQuery.length, libraryFilter, tableRows.length]);

	return {
		mappings,
		filteredEntryRows,
		tableRows,
		totalAvailable,
		loadedCount,
		emptyCopy,
	};
};
