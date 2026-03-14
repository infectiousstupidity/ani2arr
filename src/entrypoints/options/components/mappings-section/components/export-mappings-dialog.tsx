import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, Download, FileText, Search, SlidersHorizontal, X } from 'lucide-react';
import Button from '@/shared/ui/primitives/button';
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalTitle } from '@/features/media-modal/components/modal';
import { cn } from '@/shared/utils/cn';
import MappingToolbar, { type LibraryFilter, type SourceFilterSet } from './mapping-toolbar';
import { useMappingTableData } from '../hooks/use-mapping-table-data';
import type { MappingProvider, MappingSource } from '@/shared/types';
import type { ExportMappingsFilters } from '../export-mappings';
import { normalizeMappingSearchQuery } from '../search-query';
import type { MappingTableRowData } from './mapping-table';

type ExportMappingsDialogProps = {
  open: boolean;
  providerFilters: Set<MappingProvider>;
  sourceFilters: SourceFilterSet;
  searchQuery: string;
  libraryFilter: LibraryFilter;
  onClose: () => void;
  onExport: (filters: ExportMappingsFilters) => Promise<void>;
  isExporting: boolean;
};

const providerOptions: MappingProvider[] = ['sonarr', 'radarr'];
const exportableSourceOptions: MappingSource[] = ['manual', 'ignored', 'unresolved', 'auto', 'upstream'];
const sourceLabels: Record<MappingSource, string> = {
  manual: 'Manual',
  ignored: 'Ignored',
  unresolved: 'Unresolved',
  auto: 'Auto',
  upstream: 'Upstream',
};
const sourceBadgeClasses: Record<MappingSource, string> = {
  manual: 'bg-blue-500/15 text-blue-300',
  ignored: 'bg-red-500/15 text-red-300',
  unresolved: 'bg-amber-500/15 text-amber-300',
  auto: 'bg-purple-500/15 text-purple-300',
  upstream: 'bg-slate-500/15 text-slate-200',
};
const statusLabels: Record<'unmapped' | 'in-provider' | 'not-in-provider', string> = {
  unmapped: 'Unmapped',
  'in-provider': 'In library',
  'not-in-provider': 'Not in library',
};
const PREVIEW_ROW_HEIGHT = 76;
const PREVIEW_ENTRY_HEIGHT = 58;

const formatExternalId = (row: MappingTableRowData): string => {
  if (!row.externalId) {
    return 'No external ID';
  }
  return `${row.externalId.kind.toUpperCase()} ${row.externalId.id}`;
};

const resolveGroupTitle = (row: MappingTableRowData): string => {
  if (row.providerMeta?.title) {
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
    row.externalId?.id != null ? String(row.externalId.id) : '',
    row.externalId?.kind ?? '',
    ...row.sources,
    ...row.entries.flatMap(({ entry, title }) => [
      title,
      String(entry.anilistId),
      entry.status,
      entry.source,
      entry.providerMeta?.title ?? '',
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
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem || !hasNextPage || isFetchingNextPage) {
      return;
    }
    if (lastItem.index >= rows.length - 8) {
      onLoadMore();
    }
  }, [hasNextPage, isFetchingNextPage, onLoadMore, rows.length, virtualItems]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-primary px-4 py-6 text-sm text-text-secondary">
        No mappings match these filters.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border-primary bg-bg-secondary/40">
      <div className="flex items-center gap-2 border-b border-border-primary px-4 py-3 text-sm font-medium text-text-primary">
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
                <Accordion.Item value={row.id} className="rounded-lg border border-border-primary/70 bg-bg-primary/50">
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
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-bg-secondary/60 px-3 py-2"
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
  const [draftProviderFilters, setDraftProviderFilters] = useState<Set<MappingProvider>>(new Set(providerFilters));
  const [draftSourceFilters, setDraftSourceFilters] = useState<SourceFilterSet>(new Set(sourceFilters));
  const [draftSearchQuery, setDraftSearchQuery] = useState(searchQuery);
  const [draftLibraryFilter, setDraftLibraryFilter] = useState<LibraryFilter>(libraryFilter);
  const [previewSearchQuery, setPreviewSearchQuery] = useState('');

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
        source: entry.source,
        status: entry.status,
        ...(entry.updatedAt !== undefined ? { updatedAt: entry.updatedAt } : {}),
        ...(entry.linkedAniListIds ? { linkedAniListIds: entry.linkedAniListIds } : {}),
        ...(entry.inLibraryCount !== undefined ? { inLibraryCount: entry.inLibraryCount } : {}),
        ...(entry.providerMeta ? { providerMeta: entry.providerMeta } : {}),
        ...(entry.hadResolveAttempt !== undefined ? { hadResolveAttempt: entry.hadResolveAttempt } : {}),
      })),
    [filteredEntryRows],
  );

  const providerCounts = useMemo<Record<MappingProvider, number>>(
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

  const toggleProvider = (provider: MappingProvider) => {
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

  const handleExport = async () => {
    await onExport({
      providers: Array.from(draftProviderFilters),
      sources: draftSourceFilters.size > 0 ? Array.from(draftSourceFilters) : exportableSourceOptions,
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
        className="flex h-[75.5vh] max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden bg-bg-primary p-0 sm:rounded-2xl"
        floatingPortalRef={setPopoverContainer}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <div className="border-b border-border-primary px-6 py-4">
          <ModalTitle>Export mappings</ModalTitle>
          <ModalDescription className="mt-1">
            Pick the same kinds of filters used in the mappings list, then export the matching mapping entries.
          </ModalDescription>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="flex items-center gap-2 rounded-lg bg-bg-primary/70 p-1">
            {providerOptions.map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => toggleProvider(provider)}
                className={cn(
                  'rounded-md px-4 py-2 text-sm font-semibold transition-colors',
                  draftProviderFilters.has(provider)
                    ? 'bg-accent-primary text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                {provider === 'sonarr' ? 'Sonarr' : 'Radarr'}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-border-primary bg-bg-secondary/30">
            <div className="border-b border-border-primary px-4 py-3">
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
                sourceFilters={draftSourceFilters}
                sortOption="updated-desc"
                libraryFilter={draftLibraryFilter}
                searchPlaceholder="Filter what gets exported by title, AniList ID, or target ID"
                onSearchQueryChange={setDraftSearchQuery}
                onSourceFiltersChange={setDraftSourceFilters}
                onSortChange={() => {}}
                onLibraryFilterChange={setDraftLibraryFilter}
                hideSort
                popoverContainer={popoverContainer}
              />

              <div className="rounded-xl border border-sky-500/30 bg-sky-500/8 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">Will Be Exported</p>
                    <p className="mt-1 text-sm text-text-secondary">
                      The current selection above will export these matching mapping groups.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-bg-primary/50 px-3 py-1 text-xs text-sky-200">
                    <Download className="h-3.5 w-3.5" />
                    JSON export selection
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border-primary/70 bg-bg-primary/50 px-3 py-3">
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
                  <div className="rounded-lg border border-border-primary/70 bg-bg-primary/50 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-text-secondary">{entryCountLabel}</p>
                    <p className="mt-1 text-2xl font-semibold text-text-primary">{entryCountValue}</p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {draftLibraryFilter === 'all'
                        ? 'Entries matched by the export-selection filters.'
                        : 'Entries currently loaded after applying the library filter.'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border-primary/70 bg-bg-primary/50 px-3 py-3">
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

                {!isPreviewPartial ? (
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
                ) : null}

                {searchNeedsMoreCharacters ? (
                  <p className="mt-3 text-xs text-amber-300">
                    Export-selection search starts matching after 2 characters.
                  </p>
                ) : null}
                {mappings.isFetching ? <p className="mt-3 text-xs text-text-secondary">Refreshing export selection...</p> : null}
                {isPreviewPartial ? (
                  <p className="mt-3 text-xs text-amber-300">
                    Preview loads selected results incrementally for performance. Keep scrolling, or use preview search to pull in more results while the exported file still includes every match from the selection above.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border-primary bg-bg-secondary/40 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-text-primary">Preview search</p>
                <p className="text-xs text-text-secondary">
                  Search only within the selected export results shown below. This does not change what gets exported.
                </p>
              </div>
              <div className="min-w-0 flex-1 sm:max-w-md">
                <div className="flex min-w-0 items-center gap-2 rounded-md border border-border-primary bg-bg-primary px-3 py-2">
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
