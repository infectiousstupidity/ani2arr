/** Mapping modal that shows AniList display titles while editing provider ID overrides. */
// src/features/mapping/mapping-editor.tsx

import React, { useMemo } from 'react';
import { useAniListMedia } from '@/shared/queries';
import { Footer } from '@/features/media-modal/components/media-modal-footer';
import { Header } from '@/features/media-modal/components/media-modal-header';
import { Modal, ModalContent, ModalDescription, ModalTitle } from '@/features/media-modal/components/modal';
import Button from '@/shared/ui/primitives/button';
import { MappingPreviewPanel } from './mapping-preview-panel';
import { MappingSearchPanel } from './mapping-search-panel';
import { useMappingController } from './use-mapping-controller';
import type {
  MappingExternalId,
} from '@/mapping/types';
import type {
  Provider,
  RadarrLookupMovie,
  SonarrLookupSeries,
} from '@/providers';
import type { AniListTitles } from '@/anilist/schemas/media.schema';
import { metadataFromMediaObject } from '@/anilist/metadata-hints';
import { resolveTitlePreference } from '@/anilist/title-preference';
import { toMappingSearchResultFromRadarr } from './radarr.adapter';
import { usePublicOptions } from '@/options';
import { toMappingSearchResultFromSonarr } from './sonarr.adapter';
import { useToast } from '@/shared/ui/feedback/toast-provider';
import type { MappingSearchResult } from './types';
import { useMovieStatus } from '@/providers/hooks/radarr.queries';
import { useSeriesStatus } from '@/providers/hooks/sonarr.queries';

interface MappingEditorProps {
  anilistId: number;
  open: boolean;
  onClose: () => void;
  initialExternalId?: MappingExternalId | null;
  provider: Provider;
}

const buildCurrentMapping = (
  provider: Provider,
  externalId: MappingExternalId | null | undefined,
  statusItem: SonarrLookupSeries | RadarrLookupMovie | undefined,
  linkedAniListIds: number[] | undefined,
  inLibrary: boolean,
  baseUrl: string,
  fallbackTitle?: string,
): MappingSearchResult | null => {
  if (!externalId) return null;

  if (provider === 'radarr') {
    if (externalId.kind !== 'tmdb') return null;
    const tmdbId = externalId.id;
    if (statusItem) {
      return toMappingSearchResultFromRadarr(statusItem as RadarrLookupMovie, {
        baseUrl,
        inLibrary,
        ...(linkedAniListIds?.length
          ? { linkedAniListIdsByTmdbId: { [tmdbId]: linkedAniListIds } }
          : {}),
      });
    }
    return {
      provider: 'radarr',
      target: { id: tmdbId, kind: 'tmdb' },
      title: fallbackTitle ? `${fallbackTitle} (TMDB ${tmdbId})` : `TMDB ${tmdbId}`,
      inLibrary,
      ...(linkedAniListIds?.length ? { linkedAniListIds } : {}),
    };
  }

  if (externalId.kind !== 'tvdb') return null;
  const tvdbId = externalId.id;
  if (statusItem) {
    return toMappingSearchResultFromSonarr(statusItem as SonarrLookupSeries, {
      baseUrl,
      libraryTvdbIds: inLibrary ? [tvdbId] : [],
      ...(linkedAniListIds?.length
        ? { linkedAniListIdsByTvdbId: { [tvdbId]: linkedAniListIds } }
        : {}),
    });
  }
  return {
    provider: 'sonarr',
    target: { id: tvdbId, kind: 'tvdb' },
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
  const baseUrl =
    provider === 'radarr'
      ? publicOptions.data?.providers.radarr.url ?? ''
      : publicOptions.data?.providers.sonarr.url ?? '';

  const aniListMedia = useAniListMedia(anilistId, { enabled: open });
  const matchingFallbackTitle = useMemo(
    () =>
      aniListMedia.data?.title?.english ||
      aniListMedia.data?.title?.romaji ||
      aniListMedia.data?.title?.native ||
      `AniList #${anilistId}`,
    [aniListMedia.data, anilistId],
  );
  const resolvedTitles = useMemo<AniListTitles>(() => {
    const titles = aniListMedia.data?.title;
    return {
      ...(titles?.english ? { english: titles.english } : {}),
      ...(titles?.romaji ? { romaji: titles.romaji } : {}),
      ...(titles?.native ? { native: titles.native } : {}),
    };
  }, [aniListMedia.data?.title]);
  const metadataHint = useMemo(() => metadataFromMediaObject(aniListMedia.data), [aniListMedia.data]);
  const titleLanguage =
    provider === 'radarr'
      ? publicOptions.data?.providers.radarr.preferredAniListTitleLanguage ?? 'english'
      : publicOptions.data?.providers.sonarr.preferredAniListTitleLanguage ?? 'english';
  const resolvedTitle = useMemo(
    () => resolveTitlePreference({
      titles: resolvedTitles,
      preferred: titleLanguage,
      fallback: matchingFallbackTitle,
    }),
    [matchingFallbackTitle, resolvedTitles, titleLanguage],
  );
  const coverImage =
    aniListMedia.data?.coverImage?.extraLarge ??
    aniListMedia.data?.coverImage?.large ??
    aniListMedia.data?.coverImage?.medium ??
    null;
  const bannerImage = aniListMedia.data?.bannerImage ?? null;
  const format = aniListMedia.data?.format ?? null;
  const year = aniListMedia.data?.seasonYear ?? aniListMedia.data?.startDate?.year ?? null;
  const status = aniListMedia.data?.status ?? null;

  const seriesStatus = useSeriesStatus(
    { anilistId, title: matchingFallbackTitle, metadata: metadataHint },
    {
      enabled: open && provider === 'sonarr',
      force_verify: true,
      ignoreFailureCache: true,
      priority: 'high',
    },
  );
  const movieStatus = useMovieStatus(
    { anilistId, title: matchingFallbackTitle, metadata: metadataHint },
    {
      enabled: open && provider === 'radarr',
      force_verify: true,
      ignoreFailureCache: true,
      priority: 'high',
    },
  );

  const statusSeries = seriesStatus.data?.series as SonarrLookupSeries | undefined;
  const statusMovie = movieStatus.data?.movie as RadarrLookupMovie | undefined;
  const statusExternalId: MappingExternalId | null =
    provider === 'radarr'
      ? movieStatus.data?.externalId ??
        (typeof movieStatus.data?.tmdbId === 'number'
          ? { id: movieStatus.data.tmdbId, kind: 'tmdb' }
          : null)
      : seriesStatus.data?.externalId ??
        (typeof seriesStatus.data?.tvdbId === 'number'
          ? { id: seriesStatus.data.tvdbId, kind: 'tvdb' }
          : null);
  const externalId = statusExternalId ?? initialExternalId ?? null;
  const linkedAniListIds = provider === 'radarr' ? movieStatus.data?.linkedAniListIds : seriesStatus.data?.linkedAniListIds;
  const currentMapping = useMemo<MappingSearchResult | null>(() => {
    return buildCurrentMapping(
      provider,
      externalId,
      provider === 'radarr' ? statusMovie : statusSeries,
      linkedAniListIds,
      provider === 'radarr' ? movieStatus.data?.exists ?? false : seriesStatus.data?.exists ?? false,
      baseUrl,
      resolvedTitle.primary,
    );
  }, [
    baseUrl,
    externalId,
    linkedAniListIds,
    movieStatus.data?.exists,
    provider,
    resolvedTitle.primary,
    seriesStatus.data?.exists,
    statusMovie,
    statusSeries,
  ]);

  const mappingController = useMappingController({
    provider: provider,
    anilistId,
    currentMapping,
    overrideActive:
      provider === 'radarr'
        ? movieStatus.data?.overrideActive === true
        : seriesStatus.data?.overrideActive === true,
  });

  const previewMapping = mappingController.state.selected;
  const showResetPreview = mappingController.state.isDirty;
  const inLibrary = provider === 'radarr' ? Boolean(movieStatus.data?.exists) : Boolean(seriesStatus.data?.exists);
  const primaryLabel = currentMapping ? 'Update mapping' : 'Add mapping';
  const secondaryLabel = 'Exit modal';

  const handleSave = async () => {
    try {
      await mappingController.handleSubmit();
      const target = mappingController.currentMapping?.target ?? previewMapping?.target ?? null;
      toast.showToast({
        title: 'Mapping saved',
        description: target
          ? `AniList #${anilistId} now maps to ${target.kind.toUpperCase()} #${target.id}.`
          : `AniList #${anilistId} mapping was updated.`,
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
    <Modal open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent
        className="flex h-[75.5vh] w-full max-w-250 flex-col overflow-hidden rounded-none bg-bg-primary p-0 shadow-2xl shadow-black/40 sm:min-h-180 sm:rounded-2xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <ModalTitle className="sr-only">Edit mapping</ModalTitle>
        <ModalDescription className="sr-only">
          Update the {provider === 'radarr' ? 'Radarr' : 'Sonarr'} mapping for AniList entry {anilistId}.
        </ModalDescription>
        <Header
          title={resolvedTitle.primary}
          alternateTitles={resolvedTitle.alternates}
          titleLanguage={titleLanguage}
          bannerImage={bannerImage}
          coverImage={coverImage}
          anilistIds={[anilistId]}
          provider={provider}
          inLibrary={inLibrary}
          format={format}
          year={year}
          status={status}
          activeTab="mapping"
          onEnterMapping={() => {}}
          onExitMapping={onClose}
          onClose={onClose}
        />

        <div className="flex-1 overflow-hidden px-8">
          <div className="mx-auto flex h-full max-w-250 flex-col gap-6">
            <div className="grid h-full grid-cols-2 gap-6">
              <div className="flex h-full flex-col overflow-hidden">
                <div className="min-h-0 flex-1">
                  <MappingSearchPanel
                    controller={mappingController}
                    currentMapping={mappingController.currentMapping}
                    provider={provider}
                    baseUrl={baseUrl}
                    autoFocus
                  />
                </div>
              </div>

              <div className="relative">
                <div className="sticky top-0 h-full">
                  <MappingPreviewPanel
                    aniListEntry={{
                      id: anilistId,
                      title: resolvedTitle.primary,
                      ...(coverImage ? { posterUrl: coverImage } : {}),
                    }}
                    baseUrl={baseUrl}
                    provider={provider}
                    currentMapping={mappingController.currentMapping}
                    previewMapping={previewMapping}
                    isInMappingMode
                    exitClosesModal
                    showResetPreview={showResetPreview}
                    onResetPreview={mappingController.clearSelection}
                    onEditMapping={onClose}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <Footer
          leftContent={mappingController.canRevert ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void mappingController.handleRevertToAutomatic().then(onClose).catch(() => {});
              }}
              disabled={mappingController.isSubmitting}
            >
              Reset to automatic
            </Button>
          ) : null}
          primaryLabel={primaryLabel}
          primaryDisabled={!mappingController.canSubmit}
          primaryLoading={mappingController.isSubmitting}
          onPrimaryClick={() => {
            void handleSave();
          }}
          secondaryLabel={secondaryLabel}
          onSecondaryClick={onClose}
          showTertiary={false}
          tertiaryLabel=""
          onTertiaryClick={undefined}
        />
      </ModalContent>
    </Modal>
  );
};
