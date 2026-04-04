/** Export dialog UI for filtering, previewing, and downloading stored mapping data. */
// src/options-page/sections/mappings/components/export-mappings-dialog.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, Download, FileText, Search, SlidersHorizontal, X } from 'lucide-react';
import Button from '@/shared/ui/primitives/button';
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalTitle } from '@/features/media-modal/components/modal';
import { cn } from '@/shared/utils/cn';
import MappingToolbar, {
  getScopeSourceFilters,
  type LibraryFilter,
  type MappingScope,
  type ProviderFilter,
  type SourceFilter,
  type SourceFilterSet,
} from './mapping-toolbar';
import { useMappingTableData } from '../hooks/use-mapping-table-data';
import type { Provider } from '@/providers';
import type { MappingSource } from '@/mapping/types';
import type { ExportMappingsFilters } from '../export-mappings';
import { normalizeMappingSearchQuery } from '../search-query';
import type { MappingTableRowData } from './mapping-table';

type ExportMappingsDialogProps = {
  open: boolean;
  providerFilters: Set<Provider>;
  sourceFilters: SourceFilterSet;
  searchQuery: string;
  libraryFilter: LibraryFilter;
  onClose: () => void;
  onExport: (filters: ExportMappingsFilters) => Promise<void>;
  isExporting: boolean;
};

const providerOptions: Provider[] = ['sonarr', 'radarr'];
const exportableSourceOptions: MappingSource[] = ['manual', 'rejected', 'blocked', 'ignored', 'unresolved', 'auto', 'upstream'];
const sourceLabels: Record<MappingSource, string> = {
  manual: 'Manual',
  rejected: 'Rejected',
  blocked: 'Blocked',
  ignored: 'Ignored',
  unresolved: 'Unresolved',
  auto: 'Auto',
  upstream: 'Upstream',
};
const sourceBadgeClasses: Record<MappingSource, string> = {
  manual: 'border border-accent-primary/30 bg-accent-primary/16 text-accent-primary',
  rejected: 'border border-warning/20 bg-warning/12 text-warning',
  blocked: 'border border-error/28 bg-error/16 text-error',
  ignored: 'border border-error/24 bg-error/12 text-error',
  unresolved: 'border border-warning/24 bg-warning/14 text-warning',
  auto: 'border border-success/24 bg-success/14 text-success',
  upstream: 'border border-border-primary/70 bg-bg-primary/46 text-text-secondary',
};
const statusLabels: Record<'unmapped' | 'in-provider' | 'not-in-provider', string> = {
  unmapped: 'Unmapped',
  'in-provider': 'In library',
  'not-in-provider': 'Not in library',
};
const PREVIEW_ROW_HEIGHT = 76;
const PREVIEW_ENTRY_HEIGHT = 58;

const areSourceSetsEqual = (left: Set<MappingSource>, right: Set<MappingSource>): boolean => {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
};

const deriveScopeFromSourceFilters = (filters: SourceFilterSet): MappingScope => {
  if (filters.size === 1 && filters.has('manual')) return 'manual-overrides';
  if (areSourceSetsEqual(filters, getScopeSourceFilters('suppressed'))) return 'suppressed';
  if (areSourceSetsEqual(filters, getScopeSourceFilters('needs-attention'))) return 'needs-attention';
  return 'all';
};

const deriveSourceFilterFromSourceFilters = (filters: SourceFilterSet): SourceFilter => {
  if (filters.size !== 1) {
    return 'all';
  }

  return [...filters][0] ?? 'all';
};

const deriveProviderFilterFromProviderFilters = (filters: Set<Provider>): ProviderFilter => {
  if (filters.size !== 1) {
    return 'all';
  }

  return [...filters][0] ?? 'all';
};

const formatExternalId = (row: MappingTableRowData): string => {
  if (!row.externalId) {
    return 'No external ID';
  }
  return `${row.externalId.kind.toUpperCase()} ${row.externalId.id}`;
};

const resolveGroupTitle = (row: MappingTableRowData): string => {
  if (row.externalId && row.providerMeta?.title) {
    return row.providerMeta.title;
  }
  if (row.entries[0]?.title) {
    return row.entries[0].title;
  }
  return row.externalId ? `${row.externalId.kind.toUpperCase()} ${row.externalId.id}` : 'Unmapped';
};

const matchesPreviewSearch = (row: MappingTableRowData, query: string): boolean => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    resolveGroupTitle(row),
    row.provider,
    row.externalId?.id == null ? '' : String(row.externalId.id),
    row.externalId?.kind ?? '',
    ...row.sources,
    ...row.entries.flatMap(({ entry, title }) => [
      title,
      String(entry.anilistId),
      entry.status,
      entry.source,
      entry.externalId ? (entry.providerMeta?.title ?? '') : '',
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedQuery);
};

type ExportPreviewListProps = {
  rows: MappingTableRowData[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
};

const ExportPreviewList: React.FC<ExportPreviewListProps> = ({
  rows,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}) => {
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const expandedSet = useMemo(() => new Set(expandedItems), [expandedItems]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const estimateSize = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return PREVIEW_ROW_HEIGHT;
      if (!expandedSet.has(row.id)) {
        return PREVIEW_ROW_HEIGHT;
      }
      return PREVIEW_ROW_HEIGHT + 20 + row.entries.length * PREVIEW_ENTRY_HEIGHT;
    },
    [expandedSet, rows],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize,
    overscan: 6,
  });
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    const lastItem = virtualItems.at(-1);
    if (!lastItem || !hasNextPage || isFetchingNextPage) {
      return;
    }
    if (lastItem.index >= rows.length - 8) {
      onLoadMore();
    }
  }, [hasNextPage, isFetchingNextPage, onLoadMore, rows.length, virtualItems]);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-primary/75 bg-bg-primary/24 px-4 py-6 text-sm text-text-secondary">
        No mappings match these filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border-primary/75 bg-bg-primary/24 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
      <div className="flex items-center gap-2 border-b border-border-primary/75 px-4 py-3 text-sm font-medium text-text-primary">
        <FileText className="h-4 w-4 text-text-secondary" />
        Export preview
      </div>
      <div ref={scrollContainerRef} className="max-h-[42vh] overflow-auto px-4 py-4">
        <Accordion.Root
          type="multiple"
          value={expandedItems}
          onValueChange={setExpandedItems}
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
        >
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;
            const isExpanded = expandedSet.has(row.id);
            return (
              <div
                key={row.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <Accordion.Item value={row.id} className="rounded-xl border border-border-primary/70 bg-bg-primary/42 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  <Accordion.Header>
                    <Accordion.Trigger className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-text-primary" title={resolveGroupTitle(row)}>
                          {resolveGroupTitle(row)}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                          <span>{row.provider === 'sonarr' ? 'Sonarr' : 'Radarr'}</span>
                          <span className="text-text-tertiary">·</span>
                          <span>{formatExternalId(row)}</span>
                          <span className="text-text-tertiary">·</span>
                          <span>{row.entries.length} entr{row.entries.length === 1 ? 'y' : 'ies'}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-start gap-2">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {row.sources.map((source) => (
                            <span
                              key={`${row.id}-${source}`}
                              className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', sourceBadgeClasses[source])}
                            >
                              {sourceLabels[source]}
                            </span>
                          ))}
                        </div>
                        <ChevronDown
                          className={cn('mt-0.5 h-4 w-4 shrink-0 text-text-secondary transition-transform', isExpanded && 'rotate-180')}
                        />
                      </div>
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="border-t border-border-primary/60 px-3 py-3">
                    <div className="space-y-2">
                      {row.entries.map(({ entry, title }) => (
                        <div
                          key={`${row.id}-${entry.provider}-${entry.anilistId}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-primary/60 bg-bg-secondary/48 px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-text-primary" title={title}>
                              {title}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                              <span>AniList {entry.anilistId}</span>
                              <span className="text-text-tertiary">·</span>
                              <span>{statusLabels[entry.status]}</span>
                              <span className="text-text-tertiary">·</span>
                              <span>{sourceLabels[entry.source]}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Accordion.Content>
                </Accordion.Item>
              </div>
            );
          })}
        </Accordion.Root>
        {isFetchingNextPage ? (
          <div className="border-t border-border-primary/60 px-3 py-3 text-xs text-text-secondary">
            Loading more preview results...
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default function ExportMappingsDialog({
  open,
  providerFilters,
  sourceFilters,
  searchQuery,
  libraryFilter,
  onClose,
  onExport,
  isExporting,
}: ExportMappingsDialogProps): React.JSX.Element | null {
  const [popoverContainer, setPopoverContainer] = useState<HTMLDivElement | null>(null);
  const [draftProviderFilters, setDraftProviderFilters] = useState<Set<Provider>>(new Set(providerFilters));
  const [draftSourceFilters, setDraftSourceFilters] = useState<SourceFilterSet>(new Set(sourceFilters));
  const [draftScope, setDraftScope] = useState<MappingScope>(() => deriveScopeFromSourceFilters(new Set(sourceFilters)));
  const [draftSourceFilter, setDraftSourceFilter] = useState<SourceFilter>(() => deriveSourceFilterFromSourceFilters(new Set(sourceFilters)));
  const [draftSearchQuery, setDraftSearchQuery] = useState(searchQuery);
  const [draftLibraryFilter, setDraftLibraryFilter] = useState<LibraryFilter>(libraryFilter);
  const [previewSearchQuery, setPreviewSearchQuery] = useState('');

  const draftProviderFilter = useMemo(
    () => deriveProviderFilterFromProviderFilters(draftProviderFilters),
    [draftProviderFilters],
  );

  const { filteredEntryRows, tableRows, mappings, totalAvailable } = useMappingTableData({
    providerFilters: draftProviderFilters,
    sourceFilters: draftSourceFilters,
    searchQuery: draftSearchQuery,
    libraryFilter: draftLibraryFilter,
    sortOption: 'updated-desc',
    limitOverride: 250,
  });

  const mappingItems = useMemo(
    () =>
      filteredEntryRows.map(({ entry, title }) => ({
        title,
        anilistId: entry.anilistId,
        provider: entry.provider,
        externalId: entry.externalId ?? null,
        ...(entry.suppressedExternalId ? { suppressedExternalId: entry.suppressedExternalId } : {}),
        source: entry.source,
        status: entry.status,
        ...(entry.updatedAt === undefined ? {} : { updatedAt: entry.updatedAt }),
        ...(entry.linkedAniListIds ? { linkedAniListIds: entry.linkedAniListIds } : {}),
        ...(entry.inLibraryCount === undefined ? {} : { inLibraryCount: entry.inLibraryCount }),
        ...(entry.providerMeta ? { providerMeta: entry.providerMeta } : {}),
        ...(entry.hadResolveAttempt === undefined ? {} : { hadResolveAttempt: entry.hadResolveAttempt }),
      })),
    [filteredEntryRows],
  );

  const providerCounts = useMemo<Record<Provider, number>>(
    () => ({
      sonarr: mappingItems.filter(item => item.provider === 'sonarr').length,
      radarr: mappingItems.filter(item => item.provider === 'radarr').length,
    }),
    [mappingItems],
  );

  const sourceCounts = useMemo<Partial<Record<MappingSource, number>>>(() => {
    const counts: Partial<Record<MappingSource, number>> = {};
    for (const item of mappingItems) {
      counts[item.source] = (counts[item.source] ?? 0) + 1;
    }
    return counts;
  }, [mappingItems]);

  const previewRowCount = tableRows.length;
  const previewRows = useMemo(
    () => tableRows.filter((row) => matchesPreviewSearch(row, previewSearchQuery)),
    [previewSearchQuery, tableRows],
  );
  const hasActivePreviewSearch = previewSearchQuery.trim().length > 0;
  const hasPotentialExportResults = mappingItems.length > 0 || Boolean(mappings.hasNextPage) || (totalAvailable ?? 0) > 0;
  const isPreviewPartial = Boolean(mappings.hasNextPage);
  const searchNeedsMoreCharacters = draftSearchQuery.trim().length > 0 && !normalizeMappingSearchQuery(draftSearchQuery);
  const entryCountLabel = draftLibraryFilter === 'all' ? 'Matching entries' : 'Loaded matching entries';
  const entryCountValue = draftLibraryFilter === 'all' ? (totalAvailable ?? mappingItems.length) : mappingItems.length;

  useEffect(() => {
    if (!hasActivePreviewSearch || previewRows.length > 0 || !mappings.hasNextPage || mappings.isFetchingNextPage) {
      return;
    }
    void mappings.fetchNextPage();
  }, [hasActivePreviewSearch, mappings, previewRows.length]);

  useEffect(() => {
    if (tableRows.length > 0 || !mappings.hasNextPage || mappings.isFetchingNextPage) {
      return;
    }
    void mappings.fetchNextPage();
  }, [mappings, tableRows.length]);

  const toggleProvider = (provider: Provider) => {
    setDraftProviderFilters(prev => {
      const next = new Set(prev);
      if (next.has(provider)) {
        if (next.size === 1) return prev;
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  };

  const handleProviderFilterChange = (value: ProviderFilter) => {
    setDraftProviderFilters(value === 'all' ? new Set(providerOptions) : new Set([value]));
  };

  const handleSourceFilterChange = (value: SourceFilter) => {
    setDraftSourceFilter(value);
    setDraftSourceFilters(value === 'all' ? getScopeSourceFilters(draftScope) : new Set([value]));
  };

  const handleScopeChange = (value: MappingScope) => {
    setDraftScope(value);
    setDraftSourceFilter('all');
    setDraftSourceFilters(getScopeSourceFilters(value));
  };

  const handleClearRefinements = () => {
    setDraftProviderFilters(new Set(providerOptions));
    setDraftScope('all');
    setDraftSourceFilter('all');
    setDraftSourceFilters(getScopeSourceFilters('all'));
    setDraftLibraryFilter('all');
  };

  const handleExport = async () => {
    await onExport({
      providers: [...draftProviderFilters],
      sources: draftSourceFilters.size > 0 ? [...draftSourceFilters] : exportableSourceOptions,
      searchQuery: draftSearchQuery.trim(),
      libraryFilter: draftLibraryFilter,
    });
  };

  const handleLoadMorePreview = useCallback(() => {
    if (!mappings.hasNextPage || mappings.isFetchingNextPage) {
      return;
    }
    void mappings.fetchNextPage();
  }, [mappings]);

  return (
    <Modal open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <ModalContent
        className="a2a-settings-panel flex h-[75.5vh] max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden p-0"
        floatingPortalRef={setPopoverContainer}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <div className="a2a-settings-panel__header border-b px-6 py-4">
          <ModalTitle>Export mappings</ModalTitle>
          <ModalDescription className="mt-1">
            Pick the same kinds of filters used in the mappings list, then export the matching mapping entries.
          </ModalDescription>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-border-primary/75 bg-bg-primary/35 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            {providerOptions.map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => toggleProvider(provider)}
                className={cn(
                  'rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
                  draftProviderFilters.has(provider)
                    ? 'bg-accent-primary text-white shadow-sm'
                    : 'text-text-secondary hover:bg-bg-secondary/70 hover:text-text-primary',
                )}
              >
                {provider === 'sonarr' ? 'Sonarr' : 'Radarr'}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border-primary/75 bg-bg-primary/24 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
            <div className="border-b border-border-primary/75 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <SlidersHorizontal className="h-4 w-4 text-text-secondary" />
                Export selection
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                These filters determine exactly which mapping groups will be written to the export file.
              </p>
            </div>
            <div className="space-y-4 px-4 py-4">
              <MappingToolbar
                searchQuery={draftSearchQuery}
                providerFilter={draftProviderFilter}
                sourceFilter={draftSourceFilter}
                sortOption="updated-desc"
                libraryFilter={draftLibraryFilter}
                activeScope={draftScope}
                resultsSummary={`${previewRowCount} of ${totalAvailable ?? previewRowCount} groups`}
                resultsSummaryDetail="Export uses the current provider, source, search, and library filters."
                hasActiveRefinements={
                  draftProviderFilter !== 'all' ||
                  draftScope !== 'all' ||
                  draftSourceFilter !== 'all' ||
                  draftLibraryFilter !== 'all'
                }
                searchPlaceholder="Filter what gets exported by title, AniList ID, or target ID"
                onSearchQueryChange={setDraftSearchQuery}
                onProviderFilterChange={handleProviderFilterChange}
                onSourceFilterChange={handleSourceFilterChange}
                onSortChange={() => {}}
                onLibraryFilterChange={setDraftLibraryFilter}
                onScopeChange={handleScopeChange}
                onClearRefinements={handleClearRefinements}
                onAddMapping={() => {}}
                onExportMappings={handleExport}
                hideActions
                hideSort
                popoverContainer={popoverContainer}
              />

              <div className="rounded-2xl border border-accent-primary/25 bg-accent-primary/8 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-accent-primary">Will Be Exported</p>
                    <p className="mt-1 text-sm text-text-secondary">
                      The current selection above will export these matching mapping groups.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-accent-primary/25 bg-bg-primary/45 px-3 py-1 text-xs text-accent-primary">
                    <Download className="h-3.5 w-3.5" />
                    JSON export selection
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border-primary/70 bg-bg-primary/42 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-text-secondary">
                      {isPreviewPartial ? 'Previewed groups' : 'Selected groups'}
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-text-primary">{previewRowCount}</p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {isPreviewPartial
                        ? 'Grouped records currently loaded for inspection.'
                        : 'Grouped records that will be written to the export.'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border-primary/70 bg-bg-primary/42 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-text-secondary">{entryCountLabel}</p>
                    <p className="mt-1 text-2xl font-semibold text-text-primary">{entryCountValue}</p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {draftLibraryFilter === 'all'
                        ? 'Entries matched by the export-selection filters.'
                        : 'Entries currently loaded after applying the library filter.'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border-primary/70 bg-bg-primary/42 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-text-secondary">
                      {isPreviewPartial ? 'Preview cap' : 'Providers'}
                    </p>
                    {isPreviewPartial ? (
                      <>
                        <p className="mt-1 text-sm font-medium text-text-primary">Incremental preview loading</p>
                        <p className="mt-1 text-xs text-text-secondary">The dialog loads more selected results as you scroll or when preview search needs more data.</p>
                      </>
                    ) : (
                      <>
                        <p className="mt-1 text-sm font-medium text-text-primary">Sonarr {providerCounts.sonarr} · Radarr {providerCounts.radarr}</p>
                        <p className="mt-1 text-xs text-text-secondary">Distribution within the export selection.</p>
                      </>
                    )}
                  </div>
                </div>

                {isPreviewPartial ? null : (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {exportableSourceOptions
                      .filter(source => (sourceCounts[source] ?? 0) > 0)
                      .map(source => (
                        <span
                          key={`export-source-${source}`}
                          className={cn('rounded-full px-2.5 py-1 font-medium', sourceBadgeClasses[source])}
                        >
                          {sourceLabels[source]} {sourceCounts[source] ?? 0}
                        </span>
                      ))}
                  </div>
                )}

                {searchNeedsMoreCharacters ? (
                  <p className="mt-3 text-xs text-warning">
                    Export-selection search starts matching after 2 characters.
                  </p>
                ) : null}
                {mappings.isFetching ? <p className="mt-3 text-xs text-text-secondary">Refreshing export selection...</p> : null}
                {isPreviewPartial ? (
                  <p className="mt-3 text-xs text-warning">
                    Preview loads selected results incrementally for performance. Keep scrolling, or use preview search to pull in more results while the exported file still includes every match from the selection above.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border-primary/75 bg-bg-primary/24 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-text-primary">Preview search</p>
                <p className="text-xs text-text-secondary">
                  Search only within the selected export results shown below. This does not change what gets exported.
                </p>
              </div>
              <div className="min-w-0 flex-1 sm:max-w-md">
                <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border-primary/80 bg-bg-primary/45 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  <Search className="h-4 w-4 shrink-0 text-text-secondary" />
                  <input
                    type="text"
                    value={previewSearchQuery}
                    onChange={(event) => setPreviewSearchQuery(event.target.value)}
                    placeholder="Search within previewed groups and entries"
                    className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
                  />
                  {previewSearchQuery ? (
                    <button
                      type="button"
                      onClick={() => setPreviewSearchQuery('')}
                      className="shrink-0 text-text-tertiary hover:text-text-secondary"
                      aria-label="Clear preview search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-text-secondary">
              Showing {previewRows.length} of {previewRowCount} {isPreviewPartial ? 'previewed' : 'selected'} mapping groups in the preview list.
            </p>
            {hasActivePreviewSearch && previewRows.length === 0 ? (
              <p className="mt-2 text-xs text-text-secondary">
                {mappings.hasNextPage || mappings.isFetchingNextPage
                  ? 'Searching deeper through selected results...'
                  : 'No selected results match this preview search.'}
              </p>
            ) : null}
          </div>

          <ExportPreviewList
            rows={previewRows}
            hasNextPage={Boolean(mappings.hasNextPage)}
            isFetchingNextPage={mappings.isFetchingNextPage}
            onLoadMore={handleLoadMorePreview}
          />
        </div>

        <ModalFooter className="border-t border-border-primary px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => { void handleExport(); }}
            isLoading={isExporting}
            disabled={!hasPotentialExportResults || mappings.isFetching}
          >
            <Download className="mr-2 h-4 w-4" />
            Export selected
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
