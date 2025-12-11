import React, { useMemo, useState } from 'react';
import { useDebounced } from '@/shared/hooks/use-debounced';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Button from '@/shared/components/button';
import { InputField } from '@/shared/components/form';
import Pill from '@/shared/components/pill';
import { MappingEditor } from '@/shared/mapping/mapping-editor';
import { getAni2arrApi } from '@/rpc';
import {
  useAniListMedia,
  useClearMappingIgnore,
  useClearMappingOverride,
  useAniListMetadataBatch,
  useMappings,
  useSetMappingIgnore,
} from '@/shared/hooks/use-api-queries';
import { useConfirm } from '@/shared/hooks/use-confirm';
import { useToast } from '@/shared/components/toast-provider';
import type { AniListSearchResult, MappingProvider, MappingSummary } from '@/shared/types';
import type { GetAniListMetadataOutput, GetMappingsInput } from '@/rpc/schemas';
import MappingToolbar, { type MappingSort, type SourceFilterSet } from './mapping-toolbar';
import { MappingTable, type MappingTableRowData } from './mapping-table';
import { cn } from '@/shared/utils/cn';

type AddMissingEntryDialogProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (anilistId: number) => void;
};

const parseAniListIdInput = (input: string): number | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/anilist\.co\/anime\/(\d+)/i);
  if (urlMatch) {
    const parsed = Number(urlMatch[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const AddMissingEntryDialog: React.FC<AddMissingEntryDialogProps> = ({ open, onClose, onSelect }) => {
  const [input, setInput] = useState('');
  const debouncedInput = useDebounced(input, 300);
  const parsedId = useMemo(() => parseAniListIdInput(debouncedInput), [debouncedInput]);
  const directMedia = useAniListMedia(parsedId ?? undefined, { enabled: open && parsedId !== null });

  const searchTerm = parsedId === null ? debouncedInput.trim() : '';
  const handleClose = () => {
    setInput('');
    onClose();
  };

  const searchQuery = useQuery<AniListSearchResult[]>({
    queryKey: ['a2a', 'anilistSearch', searchTerm],
    enabled: open && parsedId === null && searchTerm.length >= 3,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AniListSearchResult[]> => {
      try {
        const api = getAni2arrApi();
        const results = await api.searchAniList({ search: searchTerm, limit: 8 });
        return (results ?? []).map((result) => ({
          id: result.id,
          title: result.title ?? {},
          coverImage: result.coverImage
            ? {
                large: result.coverImage.large ?? null,
                medium: result.coverImage.medium ?? null,
              }
            : null,
          format: result.format ?? null,
          status: result.status ?? null,
        }));
      } catch {
        return [];
      }
    },
  });

  const results = useMemo(() => {
    if (parsedId !== null) {
      if (directMedia.data) {
        return [
          {
            id: directMedia.data.id,
            title: directMedia.data.title ?? {},
            coverImage: directMedia.data.coverImage ?? null,
            format: directMedia.data.format ?? null,
            status: directMedia.data.status ?? null,
          } satisfies AniListSearchResult,
        ];
      }
      return [];
    }
    return searchQuery.data ?? [];
  }, [directMedia.data, parsedId, searchQuery.data]);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[min(640px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-bg-primary p-6 shadow-2xl outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold text-text-primary">Add missing entry</Dialog.Title>
              <Dialog.Description className="text-sm text-text-secondary">
                Paste an AniList URL, ID, or title.
              </Dialog.Description>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-4">
            <InputField
              label="AniList URL, ID, or title"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://anilist.co/anime/..."
              className="mt-1"
            />
          </div>

          <div className="mt-6 space-y-3">
            {searchQuery.isFetching || directMedia.isFetching ? (
              <div className="rounded-lg border border-border-primary bg-bg-secondary/60 p-4 text-sm text-text-secondary">
                Searching AniList...
              </div>
            ) : null}

            {results.length === 0 && !(searchQuery.isFetching || directMedia.isFetching) ? (
              <div className="rounded-lg border border-dashed border-border-primary/70 bg-bg-secondary/50 p-4 text-sm text-text-secondary">
                {searchTerm.length >= 3 || parsedId !== null
                  ? 'No results found.'
                  : 'Enter at least 3 characters to search.'}
              </div>
            ) : null}

            {results.map((result) => {
              const title =
                result.title.english ||
                result.title.romaji ||
                result.title.native ||
                `AniList #${result.id}`;
              return (
                <div
                  key={result.id}
                  className="flex items-center gap-3 rounded-lg border border-border-primary bg-bg-secondary/60 p-3"
                >
                  {result.coverImage?.large ? (
                    <img
                      src={result.coverImage.large}
                      alt={title}
                      className="h-16 w-12 rounded object-cover"
                    />
                  ) : (
                    <div className="h-16 w-12 rounded bg-bg-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-text-primary">{title}</div>
                    <div className="text-xs text-text-secondary">AniList #{result.id}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] uppercase text-text-secondary">
                      {result.format ? <Pill small tone="muted">{result.format}</Pill> : null}
                      {result.status ? <Pill small tone="muted">{result.status}</Pill> : null}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setInput('');
                      onSelect(result.id);
                    }}
                  >
                    Select
                  </Button>
                </div>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

const MappingsExplorer: React.FC<{
  targetAnilistId?: number;
  onClearTargetAnilistId?: () => void;
}> = ({ targetAnilistId, onClearTargetAnilistId }) => {
  const confirm = useConfirm();
  const toast = useToast();
  const clearOverride = useClearMappingOverride();
  const setIgnore = useSetMappingIgnore();
  const clearIgnore = useClearMappingIgnore();

  const [providerFilters, setProviderFilters] = useState<Set<MappingProvider>>(new Set(['sonarr', 'radarr']));
  const [sourceFilters, setSourceFilters] = useState<SourceFilterSet>(new Set(['manual', 'ignored']));
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<MappingSort>('updated-desc');
  const [editorState, setEditorState] = useState<{
    anilistId: number;
    provider: MappingProvider;
    externalId?: MappingSummary['externalId'] | null;
  } | null>(
    targetAnilistId ? { anilistId: targetAnilistId, provider: 'sonarr' } : null,
  );
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const isMutating = setIgnore.isPending || clearIgnore.isPending || clearOverride.isPending;
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
      sourceFilters.size > 0 ? Array.from(sourceFilters) : ['manual', 'ignored', 'auto', 'upstream'];
    return {
      providers: providersToQuery,
      sources: sourceList,
      limit: hasQuery ? 200 : 500,
      ...(hasQuery ? { query: trimmedQuery } : {}),
    };
  }, [debouncedQuery, providersToQuery, sourceFilters]);

  const mappings = useMappings(mappingQueryInput);
  const mappingPages = useMemo(() => mappings.data?.pages ?? [], [mappings.data?.pages]);
  const mappingEntries = useMemo(
    () => mappingPages.flatMap(page => page.mappings),
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

  const entryRows = useMemo(() => {
    return mappingEntries.map((entry) => {
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

  const tableRows = useMemo<MappingTableRowData[]>(() => {
    type Group = Omit<MappingTableRowData, 'sources'> & {
      sortIndex: number;
      sources: Set<MappingSummary['source']>;
    };

    type NormalizedRow = MappingTableRowData & { sortIndex: number };

    const groups = new Map<string, Group>();
    let order = 0;

    for (const { entry, title } of entryRows) {
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
      ignored: 1,
      upstream: 2,
      auto: 3,
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

    return sortedRows.map((row) => {
      const { sortIndex, ...rest } = row;
      void sortIndex;
      return rest;
    });
  }, [entryRows, metadataMap, sortOption]);

  const loadedCount = tableRows.length;

  const emptyCopy =
    tableRows.length === 0 && debouncedQuery.length > 0
      ? 'No results match this search.'
      : 'No mappings to show yet.';

  const handleCloseEditor = () => {
    setEditorState(null);
    onClearTargetAnilistId?.();
  };

  const handleDeleteOverride = async (anilistId: number) => {
    const ok = await confirm({
      title: 'Remove override?',
      description: `Clear the manual mapping for AniList #${anilistId}?`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
    });
    if (!ok) return;
    try {
      await clearOverride.mutateAsync({ anilistId });
      toast.showToast({
        title: 'Override removed',
        description: `Cleared manual mapping for AniList #${anilistId}.`,
        variant: 'success',
      });
    } catch (error) {
      toast.showToast({
        title: 'Remove failed',
        description: (error as Error)?.message ?? 'Unable to remove override.',
        variant: 'error',
      });
    }
  };

  const handleSetIgnore = async (anilistId: number) => {
    const ok = await confirm({
      title: 'Ignore this mapping?',
      description: 'This AniList entry will be treated as unmapped until you remove the ignore.',
      confirmText: 'Ignore',
      cancelText: 'Cancel',
    });
    if (!ok) return;
    try {
      await setIgnore.mutateAsync({ anilistId });
      toast.showToast({
        title: 'Ignored',
        description: `AniList #${anilistId} will be skipped.`,
        variant: 'success',
      });
    } catch (error) {
      toast.showToast({
        title: 'Ignore failed',
        description: (error as Error)?.message ?? 'Unable to ignore this entry.',
        variant: 'error',
      });
    }
  };

  const handleClearIgnore = async (anilistId: number) => {
    try {
      await clearIgnore.mutateAsync({ anilistId });
      toast.showToast({
        title: 'Ignore removed',
        description: `AniList #${anilistId} will use upstream/auto mapping again.`,
        variant: 'success',
      });
    } catch (error) {
      toast.showToast({
        title: 'Remove failed',
        description: (error as Error)?.message ?? 'Unable to remove ignore.',
        variant: 'error',
      });
    }
  };

  const handleEdit = (entry: MappingSummary) => {
    if (entry.provider !== 'sonarr') {
      toast.showToast({
        title: 'Radarr editing not yet available',
        description: 'Viewing Radarr mappings is supported; editing will arrive once Radarr is implemented.',
        variant: 'info',
      });
      return;
    }
    setEditorState({ anilistId: entry.anilistId, externalId: entry.externalId ?? null, provider: entry.provider });
  };

  const toggleProvider = (provider: MappingProvider) => {
    setProviderFilters((prev) => {
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-text-primary">Mappings & overrides</h2>
          <p className="text-sm text-text-secondary">
            Bridge AniList entries to your media apps with quick manual overrides.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" type="button">
            Import
          </Button>
          <Button variant="outline" size="sm" type="button">
            Export
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border-primary bg-bg-secondary/60 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary/80 px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg bg-bg-primary/70 p-1">
            {(['sonarr', 'radarr'] as MappingProvider[]).map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => toggleProvider(provider)}
                className={cn(
                  'rounded-md px-4 py-2 text-sm font-semibold transition-colors',
                  providerFilters.has(provider)
                    ? 'bg-accent-primary text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                {provider === 'sonarr' ? 'Sonarr' : 'Radarr'}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add mapping
          </Button>
        </div>

        <div className="border-b border-border-primary/80 bg-bg-secondary/70 px-4 py-3">
          <MappingToolbar
            searchQuery={searchQuery}
            sourceFilters={sourceFilters}
            sortOption={sortOption}
            onSearchQueryChange={setSearchQuery}
            onSourceFiltersChange={setSourceFilters}
            onSortChange={setSortOption}
          />
        </div>

        <MappingTable
          rows={tableRows}
          isLoading={mappings.isPending}
          isRefreshing={mappings.isFetching && !mappings.isFetchingNextPage}
          hasNextPage={Boolean(mappings.hasNextPage)}
          isFetchingNextPage={mappings.isFetchingNextPage}
          onLoadMore={() => mappings.fetchNextPage()}
          onEdit={handleEdit}
          onDeleteOverride={(entry) => handleDeleteOverride(entry.anilistId)}
          onIgnore={(entry) => handleSetIgnore(entry.anilistId)}
          onClearIgnore={(entry) => handleClearIgnore(entry.anilistId)}
          isMutating={isMutating}
          totalCount={tableRows.length}
          loadedCount={loadedCount}
          emptyCopy={emptyCopy}
        />
      </div>

      {editorState ? (
        <MappingEditor
          anilistId={editorState.anilistId}
          initialExternalId={editorState.externalId ?? null}
          open
          onClose={handleCloseEditor}
          provider={editorState.provider}
        />
      ) : null}

      <AddMissingEntryDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSelect={(id) => {
          if (!providerFilters.has('sonarr')) {
            toast.showToast({
              title: 'Radarr editing coming soon',
              description: 'Add/edit for Radarr will arrive when Radarr support is shipped.',
              variant: 'info',
            });
            setAddDialogOpen(false);
            return;
          }
          setEditorState({ anilistId: id, provider: 'sonarr', externalId: null });
          setAddDialogOpen(false);
        }}
      />
    </div>
  );
};

export default MappingsExplorer;
