/** Mapping export assembly with optional AniList metadata hydration for CSV-like outputs. */
// src/options-page/sections/mappings/export-mappings.ts

import { getAni2arrApi } from '@/rpc';
import type { GetMappingsInput, MappingCursor } from '@/rpc/schemas';
import type { AniListMetadata } from '@/anilist/schemas/metadata.schema';
import type { Provider } from '@/providers';
import { getMappingSummarySource, type MappingSource, type MappingSummary } from '@/mapping/types';
import type { LibraryFilter } from './components/mapping-toolbar';
import { normalizeMappingSearchQuery } from './search-query';

export type ExportMappingsFilters = {
  providers: Provider[];
  sources: MappingSource[];
  searchQuery: string;
  libraryFilter: LibraryFilter;
};

export type ExportMappingsPayload = {
  version: 8;
  exportedAt: string;
  filters: ExportMappingsFilters;
  summary: {
    rowCount: number;
    entryCount: number;
    providerCounts: Record<Provider, number>;
    sourceCounts: Partial<Record<MappingSource, number>>;
  };
  mappings: {
    rows: Array<{
      id: string;
      provider: Provider;
      providerId: number | null;
      sources: MappingSource[];
      updatedAt?: number;
      providerMeta?: {
        title?: string;
        type?: 'series' | 'movie';
        statusLabel?: string;
      };
      entries: Array<{
        title: string;
        metadata?: AniListMetadata | null;
        entry: {
          anilistId: number;
          provider: Provider;
          providerId: number | null;
          suppressedProviderId?: number | null;
          source: MappingSource;
          status: MappingSummary['status'];
          libraryStatus: MappingSummary['libraryStatus'];
          effectiveSource?: MappingSummary['effectiveSource'];
          effectiveReason?: MappingSummary['effectiveReason'];
          suppressionKind?: MappingSummary['suppressionKind'];
          reviewSummary?: MappingSummary['reviewSummary'];
          reviewItems?: MappingSummary['reviewItems'];
          updatedAt?: number;
          linkedAniListIds?: readonly number[];
          inLibraryCount?: number;
          providerMeta?: {
            title?: string;
            type?: 'series' | 'movie';
            statusLabel?: string;
          };
          resolverOutcome?: MappingSummary['resolverOutcome'];
          hadResolveAttempt?: boolean;
        };
      }>;
    }>;
  };
};

type EntryRow = {
  entry: MappingSummary;
  title: string;
  metadata?: AniListMetadata | null;
};

type ExportRow = ExportMappingsPayload['mappings']['rows'][number];

const METADATA_BATCH_SIZE = 100;
const EXPORT_PAGE_SIZE = 2000;
const FALLBACK_SOURCES: MappingSource[] = ['manual', 'rejected', 'ignored', 'unresolved', 'auto', 'upstream'];

const resolveTitle = (entry: MappingSummary, metadata?: AniListMetadata | null): string =>
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

const fetchMetadataMap = async (mappings: readonly MappingSummary[]): Promise<Map<number, AniListMetadata>> => {
  const ids = [...new Set(
      mappings
        .map((mapping) => mapping.anilistId)
        .filter((id): id is number => Number.isFinite(id) && id > 0),
    )];

  const metadataMap = new Map<number, AniListMetadata>();
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
      ? (status: MappingSummary['libraryStatus']) => status === 'in-provider'
      : (status: MappingSummary['libraryStatus']) => status !== 'in-provider';

  return entryRows.filter(({ entry }) => predicate(entry.libraryStatus));
};

const buildExportRows = (entryRows: readonly EntryRow[]): ExportRow[] => {
  type Group = {
    id: string;
    provider: Provider;
    providerId: number | null;
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
    const key = entry.providerId === null
      ? `${entry.provider}:unmapped:${entry.anilistId}`
      : `${entry.provider}:${entry.providerId}`;

    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, {
        id: key,
        provider: entry.provider,
        providerId: entry.providerId ?? null,
        ...(entry.providerMeta ? { providerMeta: entry.providerMeta } : {}),
        entries: [row],
        sources: new Set<MappingSource>([getMappingSummarySource(entry)]),
        ...(entry.updatedAt === undefined ? {} : { updatedAt: entry.updatedAt }),
        sortIndex: order++,
      });
      continue;
    }

    if (existing.providerMeta === undefined && entry.providerMeta) {
      existing.providerMeta = entry.providerMeta;
    }
    if (typeof entry.updatedAt === 'number') {
      existing.updatedAt = Math.max(existing.updatedAt ?? 0, entry.updatedAt);
    }
    existing.entries.push(row);
    existing.sources.add(getMappingSummarySource(entry));
  }

  const sourcePriority: Record<MappingSource, number> = {
    manual: 0,
    unresolved: 1,
    rejected: 2,
    ignored: 3,
    upstream: 4,
    auto: 5,
  };

  const fallbackTitle = (row: Group) =>
    row.providerMeta?.title ||
    row.entries[0]?.title ||
    (row.providerId === null ? 'Unmapped' : `${row.provider === 'radarr' ? 'TMDB' : 'TVDB'} #${row.providerId}`);

  return [...groups.values()]
    .toSorted((a, b) => {
      const updatedDiff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      if (updatedDiff !== 0) {
        return updatedDiff;
      }
      const sourceDiff =
        Math.min(...[...a.sources].map((source) => sourcePriority[source])) -
        Math.min(...[...b.sources].map((source) => sourcePriority[source]));
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
      providerId: group.providerId,
      sources: [...group.sources],
      ...(group.updatedAt === undefined ? {} : { updatedAt: group.updatedAt }),
      ...(group.providerMeta ? { providerMeta: group.providerMeta } : {}),
      entries: [...group.entries]
        .toSorted((a, b) => a.title.localeCompare(b.title))
        .map(({ title, metadata, entry }) => ({
          title,
          ...(metadata ? { metadata } : {}),
          entry: {
            anilistId: entry.anilistId,
            provider: entry.provider,
            providerId: entry.providerId ?? null,
            ...(entry.suppressedProviderId === undefined ? {} : { suppressedProviderId: entry.suppressedProviderId }),
            source: getMappingSummarySource(entry),
            status: entry.status,
            libraryStatus: entry.libraryStatus,
            ...(entry.effectiveSource ? { effectiveSource: entry.effectiveSource } : {}),
            ...(entry.effectiveReason ? { effectiveReason: entry.effectiveReason } : {}),
            ...(entry.suppressionKind ? { suppressionKind: entry.suppressionKind } : {}),
            ...(entry.reviewSummary ? { reviewSummary: entry.reviewSummary } : {}),
            ...(entry.reviewItems ? { reviewItems: entry.reviewItems } : {}),
            ...(entry.updatedAt === undefined ? {} : { updatedAt: entry.updatedAt }),
            ...(entry.linkedAniListIds ? { linkedAniListIds: entry.linkedAniListIds } : {}),
            ...(entry.inLibraryCount === undefined ? {} : { inLibraryCount: entry.inLibraryCount }),
            ...(entry.providerMeta ? { providerMeta: entry.providerMeta } : {}),
            ...(entry.resolverOutcome ? { resolverOutcome: entry.resolverOutcome } : {}),
            ...(entry.hadResolveAttempt === undefined ? {} : { hadResolveAttempt: entry.hadResolveAttempt }),
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

  const providerCounts: Record<Provider, number> = { sonarr: 0, radarr: 0 };
  const sourceCounts: Partial<Record<MappingSource, number>> = {};

  for (const { entry } of filteredEntryRows) {
    providerCounts[entry.provider] += 1;
    const source = getMappingSummarySource(entry);
    sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
  }

  return {
    version: 8,
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
