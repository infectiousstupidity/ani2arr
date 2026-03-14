import React, { useEffect, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import Button from '@/shared/ui/primitives/button';
import { MappingEditor } from '@/features/mapping/mapping-editor';
import {
  useAniListMedia,
  useClearMappingIgnore,
  useClearMappingOverride,
  useSetMappingIgnore,
} from '@/shared/queries';
import { useConfirm } from '@/shared/hooks/common/use-confirm';
import { useToast } from '@/shared/ui/feedback/toast-provider';
import type { MappingProvider, MappingSummary } from '@/shared/types';
import { cn } from '@/shared/utils/cn';
import { resolveProviderForAniListFormat } from '@/services/providers/resolver';
import MappingToolbar, { type LibraryFilter, type MappingSort, type SourceFilterSet } from './components/mapping-toolbar';
import { MappingTable } from './components/mapping-table';
import AddMissingEntryDialog from './components/add-missing-entry-dialog';
import ExportMappingsDialog from './components/export-mappings-dialog';
import { buildMappingsExportPayload, type ExportMappingsFilters } from './export-mappings';
import { useMappingTableData } from './hooks/use-mapping-table-data';

const MappingsSection: React.FC<{
  targetAnilistId?: number;
  onClearTargetAnilistId?: () => void;
}> = ({ targetAnilistId, onClearTargetAnilistId }) => {
  const confirm = useConfirm();
  const toast = useToast();
  const clearOverride = useClearMappingOverride();
  const setIgnore = useSetMappingIgnore();
  const clearIgnore = useClearMappingIgnore();
  const targetMedia = useAniListMedia(targetAnilistId ?? undefined, {
    enabled: typeof targetAnilistId === 'number' && Number.isFinite(targetAnilistId),
  });
  const [providerFilters, setProviderFilters] = useState<Set<MappingProvider>>(new Set(['sonarr', 'radarr']));
  const [sourceFilters, setSourceFilters] = useState<SourceFilterSet>(new Set(['manual', 'ignored', 'unresolved']));
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<MappingSort>('updated-desc');
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [editorState, setEditorState] = useState<{
    anilistId: number;
    provider: MappingProvider;
    externalId?: MappingSummary['externalId'] | null;
  } | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const isMutating = setIgnore.isPending || clearIgnore.isPending || clearOverride.isPending;
  const { mappings, tableRows, totalAvailable, loadedCount, emptyCopy } = useMappingTableData({
    providerFilters,
    sourceFilters,
    searchQuery,
    libraryFilter,
    sortOption,
  });
  const handleCloseEditor = () => {
    setEditorState(null);
    onClearTargetAnilistId?.();
  };

  useEffect(() => {
    if (typeof targetAnilistId !== 'number' || !Number.isFinite(targetAnilistId)) {
      return;
    }
    const provider = resolveProviderForAniListFormat(targetMedia.data?.format ?? null);
    if (!provider) {
      return;
    }
    setEditorState(current =>
      current && current.anilistId === targetAnilistId
        ? { ...current, provider }
        : { anilistId: targetAnilistId, provider },
    );
  }, [targetAnilistId, targetMedia.data?.format]);
  const handleDeleteOverride = async (entry: MappingSummary) => {
    const { anilistId, provider } = entry;
    const ok = await confirm({
      title: 'Remove override?',
      description: `Clear the manual mapping for AniList #${anilistId}?`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
    });
    if (!ok) return;
    try {
      await clearOverride.mutateAsync({ anilistId, provider });
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

  const handleSetIgnore = async (entry: MappingSummary) => {
    const { anilistId, provider } = entry;
    const ok = await confirm({
      title: 'Ignore this mapping?',
      description: 'This AniList entry will be treated as unmapped until you remove the ignore.',
      confirmText: 'Ignore',
      cancelText: 'Cancel',
    });
    if (!ok) return;
    try {
      await setIgnore.mutateAsync({ anilistId, provider });
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

  const handleClearIgnore = async (entry: MappingSummary) => {
    const { anilistId, provider } = entry;
    try {
      await clearIgnore.mutateAsync({ anilistId, provider });
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
    setEditorState({ anilistId: entry.anilistId, externalId: entry.externalId ?? null, provider: entry.provider });
  };

  const handleExport = async (filters: ExportMappingsFilters) => {
    setIsExporting(true);
    try {
      const payload = await buildMappingsExportPayload(filters);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const stamp = payload.exportedAt.replace(/[:.]/g, '-');
      link.href = objectUrl;
      link.download = `ani2arr-mappings-${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      toast.showToast({
        title: 'Mappings exported',
        description: `Downloaded ${payload.summary.rowCount} mapping groups with ${payload.summary.entryCount} entries.`,
        variant: 'success',
      });
      setExportDialogOpen(false);
    } catch (error) {
      toast.showToast({
        title: 'Export failed',
        description: (error as Error)?.message ?? 'Unable to export filtered mappings.',
        variant: 'error',
      });
    } finally {
      setIsExporting(false);
    }
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
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setExportDialogOpen(true)}
            isLoading={isExporting}
          >
            <Download className="mr-2 h-4 w-4" />
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
            libraryFilter={libraryFilter}
            onSearchQueryChange={setSearchQuery}
            onSourceFiltersChange={setSourceFilters}
            onSortChange={setSortOption}
            onLibraryFilterChange={setLibraryFilter}
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
          onDeleteOverride={handleDeleteOverride}
          onIgnore={handleSetIgnore}
          onClearIgnore={handleClearIgnore}
          isMutating={isMutating}
          totalCount={totalAvailable ?? tableRows.length}
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
        onSelect={(id, format) => {
          const provider = resolveProviderForAniListFormat(format);
          if (!provider) {
            toast.showToast({
              title: 'Unsupported format',
              description: 'This AniList entry does not map to Sonarr or Radarr.',
              variant: 'info',
            });
            setAddDialogOpen(false);
            return;
          }
          if (!providerFilters.has(provider)) {
            setProviderFilters(new Set([provider]));
          }
          setEditorState({ anilistId: id, provider, externalId: null });
          setAddDialogOpen(false);
        }}
      />

      {exportDialogOpen ? (
        <ExportMappingsDialog
          open={exportDialogOpen}
          providerFilters={providerFilters}
          sourceFilters={sourceFilters}
          searchQuery={searchQuery}
          libraryFilter={libraryFilter}
          onClose={() => setExportDialogOpen(false)}
          onExport={handleExport}
          isExporting={isExporting}
        />
      ) : null}
    </div>
  );
};

export default MappingsSection;
