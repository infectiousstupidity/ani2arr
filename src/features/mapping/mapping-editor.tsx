import React, { useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import Button from '@/shared/ui/primitives/button';
import { useAniListMedia, usePublicOptions, useSeriesStatus } from '@/shared/api';
import { MappingPreviewPanel } from './mapping-preview-panel';
import { MappingSearchPanel } from './mapping-search-panel';
import { useMappingController } from './use-mapping-controller';
import type { MappingExternalId, MappingProvider, MappingSearchResult, SonarrLookupSeries } from '@/shared/types';
import { metadataFromMediaObject } from '@/shared/utils/dom/anilist-dom';
import { toMappingSearchResultFromSonarr } from './sonarr.adapter';
import { useToast } from '@/shared/ui/feedback/toast-provider';

interface MappingEditorProps {
  anilistId: number;
  open: boolean;
  onClose: () => void;
  initialExternalId?: MappingExternalId | null;
  provider: MappingProvider;
}

const DIALOG_Z_INDEX = 2147483600;

const buildCurrentMapping = (
  externalId: MappingExternalId | null | undefined,
  statusSeries: SonarrLookupSeries | undefined,
  linkedAniListIds: number[] | undefined,
  inLibrary: boolean,
  baseUrl: string,
  fallbackTitle?: string,
): MappingSearchResult | null => {
  if (!externalId || externalId.kind !== 'tvdb') return null;
  const tvdbId = externalId.id;
  if (statusSeries) {
    return toMappingSearchResultFromSonarr(statusSeries, {
      baseUrl,
      libraryTvdbIds: inLibrary ? [tvdbId] : [],
      ...(linkedAniListIds && linkedAniListIds.length > 0
        ? { linkedAniListIdsByTvdbId: { [tvdbId]: linkedAniListIds } }
        : {}),
    });
  }
  return {
    service: 'sonarr',
    target: { id: tvdbId, idType: 'tvdb' },
    title: fallbackTitle ? `${fallbackTitle} (TVDB ${tvdbId})` : `TVDB ${tvdbId}`,
    inLibrary,
    ...(linkedAniListIds && linkedAniListIds.length > 0 ? { linkedAniListIds } : {}),
  };
};

export const MappingEditor: React.FC<MappingEditorProps> = ({
  anilistId,
  open,
  onClose,
  initialExternalId,
  provider,
}) => {
  const toast = useToast();
  const publicOptions = usePublicOptions();
  const baseUrl = publicOptions.data?.sonarrUrl ?? '';

  const aniListMedia = useAniListMedia(anilistId, { enabled: open });
  const aniTitle = useMemo(
    () =>
      aniListMedia.data?.title?.english ||
      aniListMedia.data?.title?.romaji ||
      aniListMedia.data?.title?.native ||
      `AniList #${anilistId}`,
    [aniListMedia.data, anilistId],
  );
  const metadataHint = useMemo(() => metadataFromMediaObject(aniListMedia.data), [aniListMedia.data]);

  const seriesStatus = useSeriesStatus(
    { anilistId, title: aniTitle, metadata: metadataHint },
    {
      enabled: open,
      force_verify: true,
      ignoreFailureCache: true,
      priority: 'high',
    },
  );

  const statusSeries = seriesStatus.data?.series as SonarrLookupSeries | undefined;
  const statusExternalId: MappingExternalId | null =
    seriesStatus.data?.externalId ??
    (typeof seriesStatus.data?.tvdbId === 'number'
      ? { id: seriesStatus.data.tvdbId, kind: 'tvdb' }
      : null);
  const externalId = statusExternalId ?? initialExternalId ?? null;
  const linkedAniListIds = seriesStatus.data?.linkedAniListIds;
  const currentMapping = useMemo<MappingSearchResult | null>(() => {
    return buildCurrentMapping(
      externalId,
      statusSeries,
      linkedAniListIds,
      seriesStatus.data?.exists ?? false,
      baseUrl,
      aniTitle,
    );
  }, [aniTitle, baseUrl, externalId, linkedAniListIds, seriesStatus.data?.exists, statusSeries]);

  const mappingController = useMappingController({
    service: provider,
    anilistId,
    currentMapping,
    overrideActive: seriesStatus.data?.overrideActive === true,
  });

  const previewMapping = mappingController.state.selected;
  const showResetPreview = mappingController.state.isDirty;

  const handleSave = async () => {
    try {
      await mappingController.handleSubmit();
      toast.showToast({
        title: 'Mapping saved',
        description: `AniList #${anilistId} now maps to TVDB #${mappingController.currentMapping?.target.id ?? previewMapping?.target.id}.`,
        variant: 'success',
      });
      onClose();
    } catch (error) {
      toast.showToast({
        title: 'Save failed',
        description: (error as Error)?.message ?? 'Unable to save mapping.',
        variant: 'error',
      });
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 bg-black/60 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out"
          style={{ zIndex: DIALOG_Z_INDEX }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 h-[90vh] w-[min(1100px,96vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl bg-bg-primary shadow-2xl outline-none"
          style={{ zIndex: DIALOG_Z_INDEX + 1 }}
        >
          <div className="flex items-start justify-between border-b border-border-primary px-6 py-4">
            <div className="space-y-1">
              <Dialog.Title className="text-lg font-semibold text-text-primary">Edit mapping</Dialog.Title>
              <Dialog.Description className="text-sm text-text-secondary">
                {aniTitle}
              </Dialog.Description>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-text-secondary hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid h-[calc(90vh-120px)] grid-cols-1 gap-6 overflow-hidden p-6 lg:grid-cols-2">
            <div className="min-h-0 overflow-hidden rounded-xl border border-border-primary bg-bg-secondary/40 p-4">
              <MappingSearchPanel
                controller={mappingController}
                currentMapping={mappingController.currentMapping}
                baseUrl={baseUrl}
                autoFocus
              />
            </div>
            <div className="min-h-0 overflow-hidden rounded-xl border border-border-primary bg-bg-secondary/40 p-4">
              <MappingPreviewPanel
                aniListEntry={{
                  id: anilistId,
                  title: aniTitle,
                  ...(aniListMedia.data?.coverImage?.large ? { posterUrl: aniListMedia.data.coverImage.large } : {}),
                }}
                baseUrl={baseUrl}
                currentMapping={mappingController.currentMapping}
                previewMapping={previewMapping}
                isInMappingMode
                showResetPreview={showResetPreview}
                onResetPreview={mappingController.clearSelection}
                onEditMapping={onClose}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border-primary px-6 py-4">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!mappingController.canSubmit || mappingController.isSubmitting}
              isLoading={mappingController.isSubmitting}
            >
              Save mapping
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
