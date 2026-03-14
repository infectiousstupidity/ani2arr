import { getAni2arrApi } from '@/rpc';
import type { AniListMetadataDto, GetMappingsInput, MappingCursor } from '@/rpc/schemas';
import type { MappingExternalId, MappingProvider, MappingSource, MappingSummary } from '@/shared/types';
import type { LibraryFilter } from './components/mapping-toolbar';
import { normalizeMappingSearchQuery } from './search-query';

export type ExportMappingsFilters = {
  providers: MappingProvider[];
  sources: MappingSource[];
  searchQuery: string;
  libraryFilter: LibraryFilter;
};

export type ExportMappingsPayload = {
  version: 3;
  exportedAt: string;
  filters: ExportMappingsFilters;
  summary: {
    rowCount: number;
    entryCount: number;
    providerCounts: Record<MappingProvider, number>;
    sourceCounts: Partial<Record<MappingSource, number>>;
  };
  mappings: {
    rows: Array<{
      id: string;
      provider: MappingProvider;
      externalId: MappingExternalId | null;
      sources: MappingSource[];
      updatedAt?: number;
      providerMeta?: {
        title?: string;
        type?: 'series' | 'movie';
        statusLabel?: string;
      };
      entries: Array<{
        title: string;
        metadata?: AniListMetadataDto | null;
        entry: {
          anilistId: number;
          provider: MappingProvider;
          externalId: MappingExternalId | null;
          source: MappingSource;
          status: 'unmapped' | 'in-provider' | 'not-in-provider';
          updatedAt?: number;
          linkedAniListIds?: readonly number[];
          inLibraryCount?: number;
          providerMeta?: {
            title?: string;
            type?: 'series' | 'movie';
            statusLabel?: string;
          };
          hadResolveAttempt?: boolean;
        };
      }>;
    }>;
  };
};

type EntryRow = {
  entry: MappingSummary;
  title: string;
  metadata?: AniListMetadataDto | null;
};

type ExportRow = ExportMappingsPayload['mappings']['rows'][number];

const METADATA_BATCH_SIZE = 100;
const EXPORT_PAGE_SIZE = 2000;
const FALLBACK_SOURCES: MappingSource[] = ['manual', 'ignored', 'unresolved', 'auto', 'upstream'];

const resolveTitle = (entry: MappingSummary, metadata?: AniListMetadataDto | null): string =>
  metadata?.titles?.english ||
  metadata?.titles?.romaji ||
  metadata?.titles?.native ||
  entry.providerMeta?.title ||
  `AniList #${entry.anilistId}`;

const chunk = <T,>(items: readonly T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const fetchAllMappings = async (filters: ExportMappingsFilters): Promise<MappingSummary[]> => {
  const api = getAni2arrApi();
  const query = normalizeMappingSearchQuery(filters.searchQuery);
  const baseInput: GetMappingsInput = {
    providers: filters.providers,
    sources: filters.sources.length > 0 ? filters.sources : FALLBACK_SOURCES,
    limit: EXPORT_PAGE_SIZE,
    ...(query ? { query } : {}),
  };

  const allMappings: MappingSummary[] = [];
  let cursor: MappingCursor | undefined;

  while (true) {
    const page = await api.getMappings({
      ...baseInput,
      ...(cursor ? { cursor } : {}),
    });
    allMappings.push(...page.mappings);
    if (!page.nextCursor) {
      break;
    }
    cursor = page.nextCursor;
  }

  return allMappings;
};

const fetchMetadataMap = async (mappings: readonly MappingSummary[]): Promise<Map<number, AniListMetadataDto>> => {
  const ids = Array.from(
    new Set(
      mappings
        .map((mapping) => mapping.anilistId)
        .filter((id): id is number => Number.isFinite(id) && id > 0),
    ),
  );

  const metadataMap = new Map<number, AniListMetadataDto>();
  if (ids.length === 0) {
    return metadataMap;
  }

  const api = getAni2arrApi();
  for (const idBatch of chunk(ids, METADATA_BATCH_SIZE)) {
    const response = await api.getAniListMetadata({
      ids: idBatch,
      refreshStale: false,
      fetchMissing: false,
      maxBatch: METADATA_BATCH_SIZE,
    });
    for (const metadata of response.metadata) {
      metadataMap.set(metadata.id, metadata);
    }
  }

  return metadataMap;
};

const applyLibraryFilter = (entryRows: EntryRow[], libraryFilter: LibraryFilter): EntryRow[] => {
  if (libraryFilter === 'all') {
    return entryRows;
  }

  const predicate =
    libraryFilter === 'in-library'
      ? (status: MappingSummary['status']) => status === 'in-provider'
      : (status: MappingSummary['status']) => status !== 'in-provider';

  return entryRows.filter(({ entry }) => predicate(entry.status));
};

const buildExportRows = (entryRows: readonly EntryRow[]): ExportRow[] => {
  type Group = {
    id: string;
    provider: MappingProvider;
    externalId: MappingExternalId | null;
    providerMeta?: MappingSummary['providerMeta'];
    entries: EntryRow[];
    sources: Set<MappingSource>;
    updatedAt?: number;
    sortIndex: number;
  };

  const groups = new Map<string, Group>();
  let order = 0;

  for (const row of entryRows) {
    const { entry } = row;
    const key = entry.externalId
      ? `${entry.provider}:${entry.externalId.kind}:${entry.externalId.id}`
      : `${entry.provider}:unmapped:${entry.anilistId}`;

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        id: key,
        provider: entry.provider,
        externalId: entry.externalId ?? null,
        ...(entry.providerMeta ? { providerMeta: entry.providerMeta } : {}),
        entries: [row],
        sources: new Set<MappingSource>([entry.source]),
        ...(entry.updatedAt !== undefined ? { updatedAt: entry.updatedAt } : {}),
        sortIndex: order++,
      });
      continue;
    }

    if (!existing.providerMeta && entry.providerMeta) {
      existing.providerMeta = entry.providerMeta;
    }
    if (typeof entry.updatedAt === 'number') {
      existing.updatedAt = Math.max(existing.updatedAt ?? 0, entry.updatedAt);
    }
    existing.entries.push(row);
    existing.sources.add(entry.source);
  }

  const sourcePriority: Record<MappingSource, number> = {
    manual: 0,
    unresolved: 1,
    ignored: 2,
    upstream: 3,
    auto: 4,
  };

  const fallbackTitle = (row: Group) =>
    row.providerMeta?.title ||
    row.entries[0]?.title ||
    (row.externalId ? `${row.externalId.kind.toUpperCase()} #${row.externalId.id}` : 'Unmapped');

  return Array.from(groups.values())
    .sort((a, b) => {
      const updatedDiff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      if (updatedDiff !== 0) {
        return updatedDiff;
      }
      const sourceDiff =
        Math.min(...Array.from(a.sources).map((source) => sourcePriority[source])) -
        Math.min(...Array.from(b.sources).map((source) => sourcePriority[source]));
      if (sourceDiff !== 0) {
        return sourceDiff;
      }
      const titleDiff = fallbackTitle(a).localeCompare(fallbackTitle(b));
      if (titleDiff !== 0) {
        return titleDiff;
      }
      return a.sortIndex - b.sortIndex;
    })
    .map((group) => ({
      id: group.id,
      provider: group.provider,
      externalId: group.externalId,
      sources: Array.from(group.sources),
      ...(group.updatedAt !== undefined ? { updatedAt: group.updatedAt } : {}),
      ...(group.providerMeta ? { providerMeta: group.providerMeta } : {}),
      entries: group.entries
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title))
        .map(({ title, metadata, entry }) => ({
          title,
          ...(metadata ? { metadata } : {}),
          entry: {
            anilistId: entry.anilistId,
            provider: entry.provider,
            externalId: entry.externalId ?? null,
            source: entry.source,
            status: entry.status,
            ...(entry.updatedAt !== undefined ? { updatedAt: entry.updatedAt } : {}),
            ...(entry.linkedAniListIds ? { linkedAniListIds: entry.linkedAniListIds } : {}),
            ...(entry.inLibraryCount !== undefined ? { inLibraryCount: entry.inLibraryCount } : {}),
            ...(entry.providerMeta ? { providerMeta: entry.providerMeta } : {}),
            ...(entry.hadResolveAttempt !== undefined ? { hadResolveAttempt: entry.hadResolveAttempt } : {}),
          },
        })),
    }));
};

export const buildMappingsExportPayload = async (
  filters: ExportMappingsFilters,
): Promise<ExportMappingsPayload> => {
  const mappings = await fetchAllMappings(filters);
  const metadataMap = await fetchMetadataMap(mappings);

  const entryRows = mappings.map((entry) => {
    const metadata = metadataMap.get(entry.anilistId);
    return {
      entry,
      title: resolveTitle(entry, metadata),
      ...(metadata ? { metadata } : {}),
    };
  });

  const filteredEntryRows = applyLibraryFilter(entryRows, filters.libraryFilter);
  const rows = buildExportRows(filteredEntryRows);

  const providerCounts: Record<MappingProvider, number> = { sonarr: 0, radarr: 0 };
  const sourceCounts: Partial<Record<MappingSource, number>> = {};

  for (const { entry } of filteredEntryRows) {
    providerCounts[entry.provider] += 1;
    sourceCounts[entry.source] = (sourceCounts[entry.source] ?? 0) + 1;
  }

  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    filters: {
      providers: filters.providers,
      sources: filters.sources.length > 0 ? filters.sources : FALLBACK_SOURCES,
      searchQuery: normalizeMappingSearchQuery(filters.searchQuery) ?? '',
      libraryFilter: filters.libraryFilter,
    },
    summary: {
      rowCount: rows.length,
      entryCount: filteredEntryRows.length,
      providerCounts,
      sourceCounts,
    },
    mappings: {
      rows,
    },
  };
};
