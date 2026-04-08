/** Options-page mappings section that wires filters, table data, and mapping actions together. */
// src/options-page/sections/mappings/mappings-section.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MediaModal } from '@/features/media-modal';
import { useMediaModalProps } from '@/features/media-modal/use-media-modal-props';
import {
  useAniListMedia,
  useClearMappingIgnore,
  useClearMappingRejectedCandidate,
  useClearMappingOverride,
  useSetMappingIgnore,
  useSetMappingRejectedCandidate,
} from '@/shared/queries';
import { useConfirm } from '@/shared/hooks/common/use-confirm';
import { useToast } from '@/shared/ui/feedback/toast-provider';
import type { Provider } from '@/providers';
import type { MappingSummary } from '@/mapping/types';
import { resolveProviderForAniListFormat } from '@/providers/provider-routing';
import SectionHeader from '../../components/section-header';
import { usePublicOptions } from '@/options';
import MappingToolbar, {
  getScopeSourceFilters,
  type LibraryFilter,
  type MappingScope,
  type MappingSort,
  type ProviderFilter,
  type SourceFilter,
  type SourceFilterSet,
} from './components/mapping-toolbar';
import { MappingTable } from './components/mapping-table';
import ExportMappingsDialog from './components/export-mappings-dialog';
import { buildMappingsExportPayload, type ExportMappingsFilters } from './export-mappings';
import { useMappingTableData } from './hooks/use-mapping-table-data';

const scopeLabels: Record<MappingScope, string> = {
  all: 'All mappings',
  'needs-attention': 'Needs attention',
  'manual-overrides': 'Overrides',
  suppressed: 'Suppressed',
};

const sourceLabels: Record<Exclude<SourceFilter, 'all'>, string> = {
  manual: 'Manual',
  auto: 'Auto',
  upstream: 'Upstream',
  rejected: 'Rejected',
  unresolved: 'Unresolved',
  ignored: 'Ignored',
};

const MappingsSection: React.FC<{
  targetAnilistId?: number;
  onClearTargetAnilistId?: () => void;
}> = ({ targetAnilistId, onClearTargetAnilistId }) => {
  const confirm = useConfirm();
  const toast = useToast();
  const clearOverride = useClearMappingOverride();
  const setRejectedCandidate = useSetMappingRejectedCandidate();
  const clearRejectedCandidate = useClearMappingRejectedCandidate();
  const setIgnore = useSetMappingIgnore();
  const clearIgnore = useClearMappingIgnore();
  const targetMedia = useAniListMedia(targetAnilistId ?? undefined, {
    enabled: typeof targetAnilistId === 'number' && Number.isFinite(targetAnilistId),
  });
  const [scope, setScope] = useState<MappingScope>('needs-attention');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<MappingSort>('updated-desc');
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [editorState, setEditorState] = useState<{
    anilistId: number;
    provider: Provider;
    providerId?: MappingSummary['providerId'] | null;
  } | null>(null);
  const isMutating =
    setRejectedCandidate.isPending ||
    clearRejectedCandidate.isPending ||
    setIgnore.isPending ||
    clearIgnore.isPending ||
    clearOverride.isPending;

  const { data: publicOptions } = usePublicOptions();
  const sonarrUrl = publicOptions?.providers.sonarr.url ?? null;
  const radarrUrl = publicOptions?.providers.radarr.url ?? null;
  const editorModalProps = useMediaModalProps({
    anilistId: editorState?.anilistId,
    title: undefined,
    metadata: null,
    portalContainer: null,
    isOpen: editorState != null,
    providerOverride: editorState?.provider,
    initialProviderId: editorState?.providerId ?? null,
  });

  const providerFilters = useMemo<Set<Provider>>(() => {
    if (providerFilter === 'all') return new Set(['sonarr', 'radarr']);
    return new Set([providerFilter]);
  }, [providerFilter]);

  const sourceFilters = useMemo<SourceFilterSet>(() => {
    if (sourceFilter !== 'all') return new Set([sourceFilter]);
    return getScopeSourceFilters(scope);
  }, [scope, sourceFilter]);

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

  const handleScopeChange = useCallback((nextScope: MappingScope) => {
    setScope(nextScope);
    setSourceFilter('all');
  }, []);

  const handleProviderFilterChange = useCallback((value: ProviderFilter) => {
    setProviderFilter(value);
  }, []);

  const handleSourceFilterChange = useCallback((value: SourceFilter) => {
    setSourceFilter(value);
  }, []);

  const handleLibraryFilterChange = useCallback((value: LibraryFilter) => {
    setLibraryFilter(value);
  }, []);

  const handleClearRefinements = useCallback(() => {
    setProviderFilter('all');
    setSourceFilter('all');
    setLibraryFilter('all');
  }, []);

  const hasActiveRefinements = providerFilter !== 'all' || sourceFilter !== 'all' || libraryFilter !== 'all';

  const resultsSummaryDetail = useMemo(() => {
    const scopeLabel = scopeLabels[scope];
    let providerLabel = 'Radarr';
    if (providerFilter === 'all') {
      providerLabel = 'All providers';
    } else if (providerFilter === 'sonarr') {
      providerLabel = 'Sonarr';
    }

    const sourceLabel =
      sourceFilter === 'all'
        ? (scope === 'all' ? 'Any source' : 'Any source in scope')
        : sourceLabels[sourceFilter];
    const libraryLabel =
      libraryFilter === 'all'
        ? 'Any library status'
        : (libraryFilter === 'in-library'
          ? 'In library'
          : 'Missing from library');
    return `${scopeLabel} - ${providerLabel} - ${sourceLabel} - ${libraryLabel}`;
  }, [libraryFilter, providerFilter, scope, sourceFilter]);

  const resultsSummary = useMemo(
    () => `${loadedCount} of ${totalAvailable ?? loadedCount} results`,
    [loadedCount, totalAvailable],
  );

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
  const runEntryMutation = useCallback(
    async (
      options: {
        confirm?: {
          title: string;
          description: string;
          confirmText: string;
          cancelText: string;
        };
        mutate: () => Promise<unknown>;
        success: {
          title: string;
          description: string;
        };
        error: {
          title: string;
          description: string;
        };
      },
    ) => {
      if (options.confirm) {
        const ok = await confirm(options.confirm);
        if (!ok) return;
      }
      try {
        await options.mutate();
        toast.showToast({
          title: options.success.title,
          description: options.success.description,
          variant: 'success',
        });
      } catch (error) {
        toast.showToast({
          title: options.error.title,
          description: (error as Error)?.message ?? options.error.description,
          variant: 'error',
        });
      }
    },
    [confirm, toast],
  );

  const handleDeleteOverride = useCallback(
    (entry: MappingSummary) =>
      runEntryMutation({
        confirm: {
          title: 'Remove override?',
          description: `Clear the manual mapping for AniList #${entry.anilistId}?`,
          confirmText: 'Remove',
          cancelText: 'Cancel',
        },
        mutate: () => clearOverride.mutateAsync({ anilistId: entry.anilistId, provider: entry.provider }),
        success: {
          title: 'Override removed',
          description: `Cleared manual mapping for AniList #${entry.anilistId}.`,
        },
        error: {
          title: 'Remove failed',
          description: 'Unable to remove override.',
        },
      }),
    [clearOverride, runEntryMutation],
  );

  const handleSetIgnore = useCallback(
    (entry: MappingSummary) =>
      runEntryMutation({
        confirm: {
          title: 'Ignore this title entirely?',
          description: 'ani2arr will stop using automatic or upstream matches for this AniList entry until you remove the title ignore or save a manual mapping.',
          confirmText: 'Ignore title',
          cancelText: 'Cancel',
        },
        mutate: () => setIgnore.mutateAsync({ anilistId: entry.anilistId, provider: entry.provider }),
        success: {
          title: 'Title ignored',
          description: `AniList #${entry.anilistId} will stay unmapped until you remove the title ignore or save a manual mapping.`,
        },
        error: {
          title: 'Ignore failed',
          description: 'Unable to ignore this entry.',
        },
      }),
    [runEntryMutation, setIgnore],
  );

  const handleClearIgnore = useCallback(
    (entry: MappingSummary) =>
      runEntryMutation({
        mutate: () => clearIgnore.mutateAsync({ anilistId: entry.anilistId, provider: entry.provider }),
        success: {
          title: 'Title ignore removed',
          description: `AniList #${entry.anilistId} will use upstream/auto mapping again.`,
        },
        error: {
          title: 'Remove failed',
          description: 'Unable to remove ignore.',
        },
      }),
    [clearIgnore, runEntryMutation],
  );

  const handleRejectCandidate = useCallback(
    (entry: MappingSummary) => {
      const providerId = entry.providerId ?? entry.suppressedProviderId;
      if (providerId == null) return Promise.resolve();
      const label = `${entry.provider === 'radarr' ? 'TMDB' : 'TVDB'} #${providerId}`;
      return runEntryMutation({
        mutate: () => setRejectedCandidate.mutateAsync({ anilistId: entry.anilistId, provider: entry.provider, providerId }),
        success: {
          title: 'Candidate rejected',
          description: `${label} will be skipped for AniList #${entry.anilistId}. This entry now stays unresolved until it is matched again, added upstream, or mapped manually.`,
        },
        error: {
          title: 'Reject failed',
          description: 'Unable to reject this candidate.',
        },
      });
    },
    [runEntryMutation, setRejectedCandidate],
  );

  const handleClearRejectedCandidate = useCallback(
    (entry: MappingSummary) => {
      const providerId = entry.providerId ?? entry.suppressedProviderId;
      if (providerId == null) return Promise.resolve();
      const label = `${entry.provider === 'radarr' ? 'TMDB' : 'TVDB'} #${providerId}`;
      return runEntryMutation({
        mutate: () => clearRejectedCandidate.mutateAsync({ anilistId: entry.anilistId, provider: entry.provider, providerId }),
        success: {
          title: 'Candidate restored',
          description: `${label} can be used again for AniList #${entry.anilistId}.`,
        },
        error: {
          title: 'Restore failed',
          description: 'Unable to restore this candidate.',
        },
      });
    },
    [clearRejectedCandidate, runEntryMutation],
  );

  const handleEdit = (entry: MappingSummary) => {
    setEditorState({ anilistId: entry.anilistId, providerId: entry.providerId ?? null, provider: entry.provider });
  };

  const handleExport = async (filters: ExportMappingsFilters) => {
    setIsExporting(true);
    try {
      const payload = await buildMappingsExportPayload(filters);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const stamp = payload.exportedAt.replaceAll(/[.:]/g, '-');
      link.href = objectUrl;
      link.download = `ani2arr-mappings-${stamp}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
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

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Mappings & overrides"
        description="Bridge AniList entries to your media apps with quick manual overrides."
      />

      <section className="a2a-settings-panel overflow-hidden">
        <div className="a2a-settings-panel__header border-b px-5 py-4">
          <h3 className="text-sm font-semibold text-text-primary">Mapping manager</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Filter, review, export, and correct AniList matches without leaving the options page.
          </p>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="a2a-settings-panel__inset rounded-2xl p-4">
            <MappingToolbar
              searchQuery={searchQuery}
              providerFilter={providerFilter}
              sourceFilter={sourceFilter}
              sortOption={sortOption}
              libraryFilter={libraryFilter}
              activeScope={scope}
              resultsSummary={resultsSummary}
              resultsSummaryDetail={resultsSummaryDetail}
              hasActiveRefinements={hasActiveRefinements}
              onSearchQueryChange={setSearchQuery}
              onProviderFilterChange={handleProviderFilterChange}
              onSourceFilterChange={handleSourceFilterChange}
              onSortChange={setSortOption}
              onLibraryFilterChange={handleLibraryFilterChange}
              onScopeChange={handleScopeChange}
              onClearRefinements={handleClearRefinements}
              onExportMappings={() => setExportDialogOpen(true)}
              isExporting={isExporting}
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-border-primary/75 bg-bg-primary/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
            <MappingTable
              rows={tableRows}
              isLoading={mappings.isPending}
              hasNextPage={Boolean(mappings.hasNextPage)}
              isFetchingNextPage={mappings.isFetchingNextPage}
              onLoadMore={() => mappings.fetchNextPage()}
              onEdit={handleEdit}
              onDeleteOverride={handleDeleteOverride}
              onRejectCandidate={handleRejectCandidate}
              onClearRejectedCandidate={handleClearRejectedCandidate}
              onIgnoreTitle={handleSetIgnore}
              onClearIgnoreTitle={handleClearIgnore}
              isMutating={isMutating}
              emptyCopy={emptyCopy}
              sonarrUrl={sonarrUrl}
              radarrUrl={radarrUrl}
            />
          </div>
        </div>
      </section>

      {editorState && editorModalProps ? (
        <MediaModal
          key={`mapping-modal-${editorState.anilistId}-${editorState.provider}`}
          isOpen
          onClose={handleCloseEditor}
          title={editorModalProps.title}
          alternateTitles={editorModalProps.alternateTitles}
          titleLanguage={editorModalProps.titleLanguage}
          bannerImage={editorModalProps.bannerImage}
          coverImage={editorModalProps.coverImage}
          anilistIds={[editorState.anilistId]}
          provider={editorModalProps.provider}
          inLibrary={editorModalProps.inLibrary}
          format={editorModalProps.format}
          year={editorModalProps.year}
          status={editorModalProps.status}
          initialTab="mapping"
          mappingTabProps={editorModalProps.mappingTabProps}
          sonarrPanelProps={editorModalProps.sonarrPanelProps}
          radarrPanelProps={editorModalProps.radarrPanelProps}
          onMappingSaved={({ anilistId, mapping }) => {
            toast.showToast({
              title: 'Mapping saved',
              description: mapping
                ? `AniList #${anilistId} now maps to ${mapping.provider === 'radarr' ? 'TMDB' : 'TVDB'} #${mapping.providerId}.`
                : `AniList #${anilistId} mapping was updated.`,
              variant: 'success',
            });
          }}
          onMappingSaveError={({ error }) => {
            toast.showToast({
              title: 'Save failed',
              description: error.message ?? 'Unable to save mapping.',
              variant: 'error',
            });
          }}
        />
      ) : null}

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
