import { useMemo } from 'react';
import { useDebounced } from '@/shared/hooks/common/use-debounced';
import { useAniListMetadataBatch, useMappings } from '@/shared/queries';
import type { MappingProvider, MappingSummary } from '@/shared/types';
import type { GetAniListMetadataOutput, GetMappingsInput, GetMappingsOutput } from '@/rpc/schemas';
import type { MappingTableRowData } from '../components/mapping-table';
import type { LibraryFilter, MappingSort, SourceFilterSet } from '../components/mapping-toolbar';

type UseMappingTableDataParams = {
  providerFilters: Set<MappingProvider>;
  sourceFilters: SourceFilterSet;
  searchQuery: string;
  libraryFilter: LibraryFilter;
  sortOption: MappingSort;
};

export const useMappingTableData = ({
  providerFilters,
  sourceFilters,
  searchQuery,
  libraryFilter,
  sortOption,
}: UseMappingTableDataParams) => {
  const debouncedQuery = useDebounced(searchQuery, 250);

  const providersToQuery = useMemo<MappingProvider[]>(() => {
    const arr = Array.from(providerFilters);
    if (arr.length === 0) return ['sonarr', 'radarr'];
    return arr.sort() as MappingProvider[];
  }, [providerFilters]);

  const mappingQueryInput = useMemo<GetMappingsInput>(() => {
    const trimmedQuery = debouncedQuery.trim();
    const hasQuery = trimmedQuery.length >= 2;
    const sourceList: NonNullable<GetMappingsInput>['sources'] =
      sourceFilters.size > 0 ? Array.from(sourceFilters) : ['manual', 'ignored', 'unresolved', 'auto', 'upstream'];
    return {
      providers: providersToQuery,
      sources: sourceList,
      limit: hasQuery ? 200 : 500,
      ...(hasQuery ? { query: trimmedQuery } : {}),
    };
  }, [debouncedQuery, providersToQuery, sourceFilters]);

  const mappings = useMappings(mappingQueryInput);
  const mappingPages = useMemo<GetMappingsOutput[]>(() => mappings.data?.pages ?? [], [mappings.data?.pages]);
  const totalAvailable = mappingPages[0]?.total;
  const mappingEntries = useMemo<GetMappingsOutput['mappings'][number][]>(
    () => mappingPages.flatMap((page) => page.mappings),
    [mappingPages],
  );

  const metadataIds = useMemo(
    () => Array.from(new Set(mappingEntries.map((entry) => entry.anilistId))),
    [mappingEntries],
  );
  const metadata = useAniListMetadataBatch(metadataIds, { enabled: metadataIds.length > 0 });
  const metadataMap = useMemo(() => {
    const map = new Map<number, GetAniListMetadataOutput['metadata'][number]>();
    for (const entry of metadata.data?.metadata ?? []) {
      map.set(entry.id, entry);
    }
    return map;
  }, [metadata.data?.metadata]);

  type EntryRow = { entry: MappingSummary; title: string; haystack: string };

  const entryRows = useMemo<EntryRow[]>(() => {
    return mappingEntries.map((entry: MappingSummary) => {
      const meta = metadataMap.get(entry.anilistId);
      const title =
        meta?.titles?.english ||
        meta?.titles?.romaji ||
        meta?.titles?.native ||
        entry.providerMeta?.title ||
        `AniList #${entry.anilistId}`;
      const haystackParts = [
        String(entry.anilistId),
        entry.externalId ? String(entry.externalId.id) : '',
        title.toLowerCase(),
        entry.providerMeta?.title?.toLowerCase() ?? '',
        meta?.titles?.english?.toLowerCase() ?? '',
        meta?.titles?.romaji?.toLowerCase() ?? '',
        meta?.titles?.native?.toLowerCase() ?? '',
      ].filter(Boolean);
      return { entry, title, haystack: haystackParts.join(' ') };
    });
  }, [mappingEntries, metadataMap]);

  const filteredEntryRows = useMemo(() => {
    if (libraryFilter === 'all') return entryRows;
    const predicate =
      libraryFilter === 'in-library'
        ? (status: MappingSummary['status']) => status === 'in-provider'
        : (status: MappingSummary['status']) => status !== 'in-provider';
    return entryRows.filter(({ entry }) => predicate(entry.status));
  }, [entryRows, libraryFilter]);

  const tableRows = useMemo<MappingTableRowData[]>(() => {
    type Group = Omit<MappingTableRowData, 'sources'> & {
      sortIndex: number;
      sources: Set<MappingSummary['source']>;
    };

    type NormalizedRow = MappingTableRowData & { sortIndex: number };

    const groups = new Map<string, Group>();
    let order = 0;

    for (const { entry, title } of filteredEntryRows) {
      const key = entry.externalId
        ? `${entry.provider}:${entry.externalId.kind}:${entry.externalId.id}`
        : `${entry.provider}:unmapped:${entry.anilistId}`;

      const existingGroup = groups.get(key);
      if (!existingGroup) {
        const newGroup: Group = {
          id: key,
          provider: entry.provider,
          externalId: entry.externalId ?? null,
          providerMeta: entry.providerMeta,
          entries: [],
          sources: new Set<MappingSummary['source']>(),
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
        newGroup.sources.add(entry.source);
        groups.set(key, newGroup);
      } else {
        if (!existingGroup.providerMeta && entry.providerMeta) {
          existingGroup.providerMeta = entry.providerMeta;
        }
        if (typeof entry.updatedAt === 'number') {
          existingGroup.updatedAt = Math.max(existingGroup.updatedAt ?? 0, entry.updatedAt);
        }
        existingGroup.entries.push({
          entry,
          title,
          metadata: metadataMap.get(entry.anilistId),
        });
        existingGroup.sources.add(entry.source);
      }
    }

    const sourcePriority: Record<MappingSummary['source'], number> = {
      manual: 0,
      unresolved: 1,
      ignored: 2,
      upstream: 3,
      auto: 4,
    };

    const resolveTitle = (row: MappingTableRowData) => {
      const fallback = row.externalId
        ? `${row.externalId.kind.toUpperCase()} #${row.externalId.id}`
        : 'Unmapped';
      return row.providerMeta?.title ?? row.entries[0]?.title ?? fallback;
    };

    const getSourceRank = (sources: MappingSummary['source'][]) => {
      if (sources.length === 0) return Number.MAX_SAFE_INTEGER;
      return Math.min(...sources.map((source) => sourcePriority[source] ?? Number.MAX_SAFE_INTEGER));
    };

    const getLinkedStats = (row: MappingTableRowData) => {
      let inLibrary = 0;
      for (const { entry } of row.entries) {
        if (entry.status === 'in-provider') {
          inLibrary += 1;
        }
      }
      return { linked: row.entries.length, inLibrary };
    };

    const compareTitles = (a: NormalizedRow, b: NormalizedRow) => {
      const diff = resolveTitle(a).localeCompare(resolveTitle(b));
      return diff !== 0 ? diff : a.sortIndex - b.sortIndex;
    };

    const rows: NormalizedRow[] = Array.from(groups.values()).map((group) => ({
      ...group,
      entries: group.entries.sort((a, b) => a.title.localeCompare(b.title)),
      sources: Array.from(group.sources),
    }));

    const sortedRows = rows.sort((a, b) => {
      switch (sortOption) {
        case 'title-asc':
          return compareTitles(a, b);
        case 'title-desc':
          return compareTitles(b, a);
        case 'updated-asc': {
          const diff = (a.updatedAt ?? Number.POSITIVE_INFINITY) - (b.updatedAt ?? Number.POSITIVE_INFINITY);
          if (diff !== 0) return diff;
          return compareTitles(a, b);
        }
        case 'updated-desc': {
          const diff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
          if (diff !== 0) return diff;
          return compareTitles(a, b);
        }
        case 'linked-desc':
        case 'linked-asc': {
          const statsA = getLinkedStats(a);
          const statsB = getLinkedStats(b);
          const linkedDiff = statsB.linked - statsA.linked;
          if (linkedDiff !== 0) return sortOption === 'linked-desc' ? linkedDiff : -linkedDiff;
          const libraryDiff = statsB.inLibrary - statsA.inLibrary;
          if (libraryDiff !== 0) return sortOption === 'linked-desc' ? libraryDiff : -libraryDiff;
          return compareTitles(a, b);
        }
        case 'source': {
          const rankA = getSourceRank(a.sources);
          const rankB = getSourceRank(b.sources);
          if (rankA !== rankB) return rankA - rankB;
          return compareTitles(a, b);
        }
        default:
          return a.sortIndex - b.sortIndex;
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
      return 'No results match this search.';
    }
    if (tableRows.length === 0 && libraryFilter === 'in-library') {
      return 'No mappings are in your library yet.';
    }
    if (tableRows.length === 0 && libraryFilter === 'not-in-library') {
      return 'No mappings are missing from your library right now.';
    }
    return 'No mappings to show yet.';
  }, [debouncedQuery.length, libraryFilter, tableRows.length]);

  return {
    mappings,
    tableRows,
    totalAvailable,
    loadedCount,
    emptyCopy,
  };
};
