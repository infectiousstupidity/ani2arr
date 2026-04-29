/** Options-page mappings section that wires filters, table data, and mapping actions together. */
// src/options-page/sections/mappings/mappings-section.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { AniListId } from '@/anilist';
import { MediaModal } from '@/features/media-modal';
import {
  useAniListMedia,
  useClearMappingIgnore,
  useClearMappingRejectedCandidate,
  useClearManualMapping,
  useSetMappingIgnore,
  useSetMappingRejectedCandidate,
} from '@/shared/queries';
import { useConfirm } from '@/shared/hooks/use-confirm';
import { useToast } from '@/shared/ui/feedback/toast-provider';
import { PROVIDERS, getProviderIdentityIdLabel, parseProviderIdentity } from '@/providers';
import type { Provider } from '@/providers';
import type { MappingListRow } from '@/mapping/queries/list-mappings';
import { resolveProviderForAniListFormat } from '@/providers/provider-routing';
import SectionHeader from '../../components/section-header';
import { usePublicOptions } from '@/options';
import {
	MappingToolbar,
  getScopeEntryKindFilters,
  type EntryKindFilter,
  type EntryKindFilterSet,
  type LibraryFilter,
  type MappingScope,
  type MappingSort,
  type ProviderFilter,
} from './components/mapping-toolbar';
import { MappingTable } from './components/mapping-table';
import { useMappingTableData } from './hooks/use-mapping-table-data';

const scopeLabels: Record<MappingScope, string> = {
  all: 'All mappings',
  'needs-attention': 'Needs attention',
  'manual-mappings': 'Manual mappings',
  suppressed: 'Suppressed',
};

const entryKindLabels: Record<Exclude<EntryKindFilter, 'all'>, string> = {
  manual: 'Manual',
  auto: 'Auto',
  upstream: 'Upstream',
  rejected: 'Rejected',
  unmapped: 'Unmapped',
  unknown: 'Unknown',
  ignored: 'Ignored',
};

const MappingsSection: React.FC<{
  targetAnilistId?: AniListId;
  onClearTargetAnilistId?: () => void;
}> = ({ targetAnilistId, onClearTargetAnilistId }) => {
  const confirm = useConfirm();
  const toast = useToast();
  const clearManualMapping = useClearManualMapping();
  const setRejectedCandidate = useSetMappingRejectedCandidate();
  const clearRejectedCandidate = useClearMappingRejectedCandidate();
  const setIgnore = useSetMappingIgnore();
  const clearIgnore = useClearMappingIgnore();
  const targetMedia = useAniListMedia(targetAnilistId ?? undefined, {
    enabled: Boolean(targetAnilistId),
  });
  const [scope, setScope] = useState<MappingScope>('needs-attention');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [entryKindFilter, setEntryKindFilter] = useState<EntryKindFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<MappingSort>('updated-desc');
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [editorState, setEditorState] = useState<{
    anilistId: AniListId;
    provider: Provider;
  } | null>(null);
  const isMutating =
    setRejectedCandidate.isPending ||
    clearRejectedCandidate.isPending ||
    setIgnore.isPending ||
    clearIgnore.isPending ||
    clearManualMapping.isPending;

  const { data: publicOptions } = usePublicOptions();
  const sonarrUrl = publicOptions?.providers.sonarr.url ?? null;
  const radarrUrl = publicOptions?.providers.radarr.url ?? null;

  const providerFilters = useMemo<Set<Provider>>(() => {
    if (providerFilter === 'all') return new Set(PROVIDERS);
    return new Set([providerFilter]);
  }, [providerFilter]);

  const entryKindFilters = useMemo<EntryKindFilterSet>(() => {
    if (entryKindFilter !== 'all') return new Set([entryKindFilter]);
    return getScopeEntryKindFilters(scope);
  }, [entryKindFilter, scope]);

  const { mappings, tableRows, totalAvailable, loadedCount, emptyCopy } = useMappingTableData({
    providerFilters,
    entryKindFilters,
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
    setEntryKindFilter('all');
  }, []);

  const handleProviderFilterChange = useCallback((value: ProviderFilter) => {
    setProviderFilter(value);
  }, []);

  const handleEntryKindFilterChange = useCallback((value: EntryKindFilter) => {
    setEntryKindFilter(value);
  }, []);

  const handleLibraryFilterChange = useCallback((value: LibraryFilter) => {
    setLibraryFilter(value);
  }, []);

  const handleClearRefinements = useCallback(() => {
    setProviderFilter('all');
    setEntryKindFilter('all');
    setLibraryFilter('all');
  }, []);

  const hasActiveRefinements = providerFilter !== 'all' || entryKindFilter !== 'all' || libraryFilter !== 'all';

  const resultsSummaryDetail = useMemo(() => {
    const scopeLabel = scopeLabels[scope];
    let providerLabel = 'Radarr';
    if (providerFilter === 'all') {
      providerLabel = 'All providers';
    } else if (providerFilter === 'sonarr') {
      providerLabel = 'Sonarr';
    }

    const entryKindLabel =
      entryKindFilter === 'all'
        ? (scope === 'all' ? 'Any kind' : 'Any kind in scope')
        : entryKindLabels[entryKindFilter];
    const libraryLabel =
      libraryFilter === 'all'
        ? 'Any library status'
        : (libraryFilter === 'in-library'
          ? 'In library'
          : 'Missing from library');
    return `${scopeLabel} - ${providerLabel} - ${entryKindLabel} - ${libraryLabel}`;
  }, [entryKindFilter, libraryFilter, providerFilter, scope]);

  const resultsSummary = useMemo(
    () => `${loadedCount} of ${totalAvailable ?? loadedCount} results`,
    [loadedCount, totalAvailable],
  );

  useEffect(() => {
    if (!targetAnilistId) {
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

  const handleDeleteManualMapping = useCallback(
    (entry: MappingListRow) =>
      runEntryMutation({
        confirm: {
          title: 'Remove manual mapping?',
          description: `Clear the manual mapping for AniList #${entry.anilistId}?`,
          confirmText: 'Remove',
          cancelText: 'Cancel',
        },
        mutate: () => clearManualMapping.mutateAsync({ anilistId: entry.anilistId, provider: entry.provider }),
        success: {
          title: 'Manual mapping removed',
          description: `Cleared manual mapping for AniList #${entry.anilistId}.`,
        },
        error: {
          title: 'Remove failed',
          description: 'Unable to remove manual mapping.',
        },
      }),
    [clearManualMapping, runEntryMutation],
  );

  const handleSetIgnore = useCallback(
    (entry: MappingListRow) =>
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
    (entry: MappingListRow) =>
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
    (entry: MappingListRow) => {
      const providerId = entry.providerId ?? entry.suppressedProviderId;
      if (providerId == null) return Promise.resolve();
      const providerIdentity = parseProviderIdentity(entry.provider, providerId);
      const label = getProviderIdentityIdLabel(providerIdentity);
      return runEntryMutation({
        mutate: () => setRejectedCandidate.mutateAsync({ anilistId: entry.anilistId, ...providerIdentity }),
        success: {
          title: 'Candidate rejected',
          description: `${label} will be skipped for AniList #${entry.anilistId}. This entry now stays unmapped until it is matched again, added upstream, or mapped manually.`,
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
    (entry: MappingListRow) => {
      const providerId = entry.providerId ?? entry.suppressedProviderId;
      if (providerId == null) return Promise.resolve();
      const providerIdentity = parseProviderIdentity(entry.provider, providerId);
      const label = getProviderIdentityIdLabel(providerIdentity);
      return runEntryMutation({
        mutate: () => clearRejectedCandidate.mutateAsync({ anilistId: entry.anilistId, ...providerIdentity }),
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

  const handleEdit = (entry: MappingListRow) => {
    setEditorState({ anilistId: entry.anilistId, provider: entry.provider });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Manual mappings"
        description="Bridge AniList entries to your media apps with quick manual mappings."
      />

      <section className="a2a-settings-panel overflow-hidden">
        <div className="a2a-settings-panel__header border-b px-5 py-4">
          <h3 className="text-sm font-semibold text-text-primary">Mapping manager</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Filter, review and correct AniList matches without leaving the options page.
          </p>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="a2a-settings-panel__inset rounded-2xl p-4">
            <MappingToolbar
              searchQuery={searchQuery}
              providerFilter={providerFilter}
              entryKindFilter={entryKindFilter}
              sortOption={sortOption}
              libraryFilter={libraryFilter}
              activeScope={scope}
              resultsSummary={resultsSummary}
              resultsSummaryDetail={resultsSummaryDetail}
              hasActiveRefinements={hasActiveRefinements}
              onSearchQueryChange={setSearchQuery}
              onProviderFilterChange={handleProviderFilterChange}
              onEntryKindFilterChange={handleEntryKindFilterChange}
              onSortChange={setSortOption}
              onLibraryFilterChange={handleLibraryFilterChange}
              onScopeChange={handleScopeChange}
              onClearRefinements={handleClearRefinements}
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
              onDeleteManualMapping={handleDeleteManualMapping}
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

      {editorState ? (
        <MediaModal
          key={`mapping-modal-${editorState.anilistId}-${editorState.provider}`}
          state={{
            anilistId: editorState.anilistId,
            provider: editorState.provider,
            initialView: 'mapping',
            openSource: 'options-page',
          }}
          onClose={handleCloseEditor}
          onMappingSaved={({ anilistId, mapping }) => {
            toast.showToast({
              title: 'Mapping saved',
              description: mapping
                ? `AniList #${anilistId} now maps to ${getProviderIdentityIdLabel(mapping)}.`
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
    </div>
  );
};

export default MappingsSection;
