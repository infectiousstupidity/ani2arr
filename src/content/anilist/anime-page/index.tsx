/** AniList anime-page surface composition and mount orchestration. */
// src/content/anilist/anime-page/index.tsx

import React, { useCallback, useState } from 'react';
import ReactDOM, { Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { browser } from 'wxt/browser';
import type { CheckMovieStatusResponse, CheckSeriesStatusResponse } from '@/rpc/types';
import { ExtensionErrorBoundary } from '@/components/extension-error-boundary';
import { useTheme } from '@/shared/hooks/common/use-theme';
import { useAniListMetadataBatch } from '@/shared/queries';
import { useMediaModalProps } from '@/content/media-modal/use-media-modal-props';
import { createContentEntrypointShell, type ContentEntrypointShellContext } from '@/content/core/create-content-script-shell';
import { useA2aBroadcasts } from '@/shared/queries/use-a2a-broadcasts';
import { usePublicOptions } from '@/options';
import MediaActions, { type Status } from './media-actions';
import { logger } from '@/shared/utils/logger';
import { extractMediaMetadataFromDom } from '@/content/anilist/dom/extract-media-metadata';
import { mergeMetadataHints, metadataHintFromAniListMetadata } from '@/anilist/metadata-hints';
import {
  getProviderLibrarySlug,
  type ProviderMediaPathSource,
} from '@/providers/library/paths';
import { resolveProviderForAniListFormat } from '@/providers/provider-routing';
import type {
  AniListMediaHint,
} from '@/anilist/schemas/media.schema';
import type { RadarrFormState } from '@/providers/settings/radarr-settings.schema';
import type { SonarrFormState } from '@/providers/settings/sonarr-settings.schema';
import { useAddMovie, useMovieStatus } from '@/providers/hooks/radarr.queries';
import { useAddSeries, useSeriesStatus } from '@/providers/hooks/sonarr.queries';
import { MediaModal } from '@/features/media-modal';
import { useMediaModalState } from '@/features/media-modal/hooks/use-media-modal-state';
import '@/shared/styles/base.css';
import './style.css';
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';
import { ConfirmProvider } from '@/shared/hooks/common/use-confirm';
import {
  ACTIONS_SELECTOR,
  ANCHOR_ID,
  SIDEBAR_SELECTOR,
  UI_NAME,
  attachSizeSync,
  ensureActionsAnchor,
  removeLayoutArtifacts,
  resolveAnimePageProvider,
  readFormatFromSidebar,
  shouldSkipByFormat,
  startAnchorKeeper,
  waitForElement,
} from './layout';

const log = logger.create('AniList Content');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const ANIME_PAGE = new MatchPattern('*://anilist.co/anime/*');

/* -------------------------------- React UI -------------------------------- */

interface ContentRootProps {
  anilistId: number;
  title: string;
  metadata: AniListMediaHint | null;
}

export const ContentRoot: React.FC<ContentRootProps> = ({ anilistId, title, metadata }) => {
  const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null);
  const hostRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setHostElement(node);
    }
  }, []);
  useTheme({ current: hostElement });
  useA2aBroadcasts();

  const mediaModal = useMediaModalState();
  const { data: options, isPending: optionsPending, isError: optionsError } = usePublicOptions();
  const hasConfiguredProvider = Boolean(
    options?.providers.sonarr.isConfigured || options?.providers.radarr.isConfigured,
  );
  const metadataBatch = useAniListMetadataBatch([anilistId], {
    enabled: Number.isFinite(anilistId) && hasConfiguredProvider,
  });
  const canonicalMetadata = metadataHintFromAniListMetadata(metadataBatch.data?.metadata?.[0] ?? null);
  const resolvedMetadata = mergeMetadataHints(canonicalMetadata, metadata);
  const provider = resolveProviderForAniListFormat(resolvedMetadata?.format ?? null);
  const uiEnabled =
    provider === 'radarr'
      ? (options?.ui?.animePages.radarr.enabled ?? true)
      : (options?.ui?.animePages.sonarr.enabled ?? true);
  const isConfigured =
    provider === 'radarr'
      ? options?.providers.radarr.isConfigured === true
      : options?.providers.sonarr.isConfigured === true;
  const sonarrDefaults: SonarrFormState | null = options?.providers.sonarr.defaults ?? null;
  const radarrDefaults: RadarrFormState | null = options?.providers.radarr.defaults ?? null;
  const defaults = provider === 'radarr' ? radarrDefaults : sonarrDefaults;

  const seriesStatusQuery = useSeriesStatus(
    { anilistId, title, metadata: resolvedMetadata },
    {
      enabled: Boolean(anilistId && provider === 'sonarr' && isConfigured),
      force_verify: true,
      ignoreFailureCache: true,
      priority: 'high',
    },
  );
  const movieStatusQuery = useMovieStatus(
    { anilistId, title, metadata: resolvedMetadata },
    {
      enabled: Boolean(anilistId && provider === 'radarr' && isConfigured),
      force_verify: true,
      ignoreFailureCache: true,
      priority: 'high',
    },
  );
  const addSeriesMutation = useAddSeries();
  const addMovieMutation = useAddMovie();

  const statusQuery = provider === 'radarr' ? movieStatusQuery : seriesStatusQuery;
  const seriesStatusData = provider === 'sonarr' ? (seriesStatusQuery.data as CheckSeriesStatusResponse | undefined) : undefined;
  const movieStatusData = provider === 'radarr' ? (movieStatusQuery.data as CheckMovieStatusResponse | undefined) : undefined;

  const handleQuickAdd = () => {
    if (!provider || !isConfigured || !defaults) {
      void browser.runtime
        .sendMessage({
          _a2a: true,
          type: 'OPEN_OPTIONS_PAGE',
          sectionId: provider ?? 'sonarr',
          timestamp: Date.now(),
        })
        .catch(() => {});
      return;
    }
    if (provider === 'radarr') {
      if (!radarrDefaults) return;
      addMovieMutation.mutate({
        anilistId,
        title,
        primaryTitleHint: title,
        metadata: resolvedMetadata,
        form: { ...radarrDefaults },
      });
      return;
    }
    if (!sonarrDefaults) return;
    addSeriesMutation.mutate({
      anilistId,
      title,
      primaryTitleHint: title,
      metadata: resolvedMetadata,
      form: { ...sonarrDefaults },
    });
  };

  const mappingUnavailable =
    provider === 'radarr'
      ? movieStatusQuery.data?.anilistTmdbLinkMissing === true
      : seriesStatusQuery.data?.anilistTvdbLinkMissing === true;

  const getStatus = (): Status => {
    if (optionsPending) return 'LOADING';
    if (optionsError) return 'ERROR';
    if (!provider || !isConfigured) return 'ERROR';
    // Only show loading if fetching AND we don't have data yet (avoid flash when refetching)
    if (statusQuery.fetchStatus === 'fetching' && !statusQuery.data) return 'LOADING';
    if (statusQuery.isError || mappingUnavailable) return 'ERROR';
    if (statusQuery.data?.exists || (provider === 'radarr' ? addMovieMutation.isSuccess : addSeriesMutation.isSuccess)) {
      return 'IN';
    }
    if (provider === 'radarr' ? addMovieMutation.isPending : addSeriesMutation.isPending) return 'ADDING';
    if (provider === 'radarr' ? addMovieMutation.isError : addSeriesMutation.isError) return 'ERROR';
    return 'NOT_IN';
  };

  const status: Status = getStatus();

  const librarySlug =
    provider === 'radarr'
      ? getProviderLibrarySlug('radarr', (movieStatusData?.movie ?? addMovieMutation.data ?? null) as ProviderMediaPathSource | null)
      : getProviderLibrarySlug('sonarr', (seriesStatusData?.series ?? addSeriesMutation.data ?? null) as ProviderMediaPathSource | null);

  const resolvedSearchTerm = statusQuery.data?.successfulSynonym ?? title;

  const modalProps = useMediaModalProps({
    anilistId: mediaModal.state?.anilistId,
    title: mediaModal.state?.title,
    metadata: mediaModal.state?.metadata,
    portalContainer: hostElement,
    isOpen: mediaModal.state?.isOpen ?? false,
  });

  const externalId =
    mappingUnavailable
      ? null
      : (provider === 'radarr'
        ? movieStatusQuery.data?.tmdbId ?? null
        : seriesStatusQuery.data?.tvdbId ?? null);

  if (!provider) {
    return null;
  }

  if (!uiEnabled) {
    return null;
  }

  return (
    <div ref={hostRef} style={{ width: '100%' }}>
      <ConfirmProvider portalContainer={hostElement ?? null}>
        <MediaActions
          provider={provider}
          status={status}
          {...(librarySlug ? { librarySlug } : {})}
          resolvedSearchTerm={resolvedSearchTerm}
          externalId={externalId}
          noAutoMatch={mappingUnavailable}
          onQuickAdd={handleQuickAdd}
          onOpenModal={() => {
            mediaModal.open({
              anilistId,
              title,
              initialTab: 'series',
              metadata: resolvedMetadata,
            });
          }}
          onOpenMappingFix={(mappingRequired) => {
            mediaModal.open({
              anilistId,
              title,
              initialTab: 'mapping',
              initialMappingRequired: mappingRequired ?? mappingUnavailable,
              metadata: resolvedMetadata,
            });
          }}
          portalContainer={hostElement ?? undefined}
        />
        {hostElement && mediaModal.state && modalProps && (
          <MediaModal
            key={`modal-${mediaModal.state.anilistId}`}
            isOpen={mediaModal.state.isOpen}
            onClose={mediaModal.reset}
            title={modalProps.title}
            alternateTitles={modalProps.alternateTitles}
            titleLanguage={modalProps.titleLanguage}
            bannerImage={modalProps.bannerImage}
            coverImage={modalProps.coverImage}
            anilistIds={[mediaModal.state.anilistId]}
            provider={modalProps.provider}
            inLibrary={modalProps.inLibrary}
            format={modalProps.format}
            year={modalProps.year}
            status={modalProps.status}
            initialTab={mediaModal.state.initialTab ?? 'series'}
            initialMappingRequired={mediaModal.state.initialMappingRequired ?? false}
            portalContainer={hostElement}
            mappingTabProps={modalProps.mappingTabProps}
            sonarrPanelProps={modalProps.sonarrPanelProps}
            radarrPanelProps={modalProps.radarrPanelProps}
          />
        )}
      </ConfirmProvider>
    </div>
  );
};

/* -------------------------- Content-script boot --------------------------- */

let ui: ShadowRootContentScriptUi<Root> | null = null;
let stopAnchorKeeper: (() => void) | null = null;
let stopSizeSync: (() => void) | null = null;

const removeAnimeUI = (): void => {
  try {
    ui?.remove();
  } catch (error) {
    log.error('Error removing UI:', error);
  }
  ui = null;
  stopAnchorKeeper?.();
  stopAnchorKeeper = null;
  stopSizeSync?.();
  stopSizeSync = null;
  removeLayoutArtifacts();
};

const isAnimePageShellEligible = async ({
  url,
  publicOptions,
  signal,
}: Pick<ContentEntrypointShellContext, 'url' | 'publicOptions' | 'signal'>): Promise<boolean> => {
  if (!ANIME_PAGE.includes(url)) {
    return false;
  }

  const provider = await resolveAnimePageProvider(signal);
  if (!provider) {
    return false;
  }

  return provider === 'radarr'
    ? (publicOptions.ui?.animePages.radarr.enabled ?? true)
    : (publicOptions.ui?.animePages.sonarr.enabled ?? true);
};

async function mountAnimePageUI({
  ctx,
  url,
  signal,
  isCurrent,
}: ContentEntrypointShellContext): Promise<void> {
  const idMatch = new URL(url).pathname.match(/\/anime\/(\d+)/);
  const anilistId = idMatch?.[1] ? Number.parseInt(idMatch[1], 10) : null;
  if (!anilistId) return;

  await Promise.all([
    waitForElement(ACTIONS_SELECTOR, { signal }),
    waitForElement(SIDEBAR_SELECTOR, { signal }),
    waitForElement('h1', { signal }),
  ]);

  if (!isCurrent()) return;

  if (shouldSkipByFormat(document)) {
    removeAnimeUI();
    log.debug('AniList page skipped due to format being movie/music');
    return;
  }

  const title = document.querySelector('h1')?.textContent?.trim() ?? '';
  if (!title) return;

  const domMetadata = extractMediaMetadataFromDom(anilistId);
  const sidebarFormat = readFormatFromSidebar(document);
  const fallbackMetadata: AniListMediaHint | null = title
    ? {
        titles: { romaji: title },
        synonyms: [title],
        startYear: null,
        format: sidebarFormat,
        relationPrequelIds: null,
      }
    : null;
  const metadata = mergeMetadataHints(domMetadata, fallbackMetadata);

  stopAnchorKeeper?.();
  stopAnchorKeeper = startAnchorKeeper();
  ensureActionsAnchor();

  if (!isCurrent()) {
    removeAnimeUI();
    return;
  }

  if (ui) {
    ui.remove();
    stopSizeSync?.();
    ui = null;
    stopSizeSync = null;
  }

  const nextUi = await createShadowRootUi(ctx, {
    name: UI_NAME,
    position: 'inline',
    anchor: `#${ANCHOR_ID}`,
    append: 'last',
    onMount: (uiContainer: HTMLElement, _shadow: ShadowRoot, shadowHost: HTMLElement): Root => {
      stopSizeSync = attachSizeSync(shadowHost);
      const root = ReactDOM.createRoot(uiContainer);
      root.render(
        <ExtensionErrorBoundary scope="anilist-anime-root">
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <ContentRoot anilistId={anilistId} title={title} metadata={metadata ?? null} />
            </TooltipProvider>
          </QueryClientProvider>
        </ExtensionErrorBoundary>,
      );
      return root;
    },
    onRemove: (mounted?: Root) => {
      mounted?.unmount();
      stopSizeSync?.();
      stopSizeSync = null;
    },
  });

  if (!isCurrent()) {
    nextUi.remove();
    return;
  }

  ui = nextUi;
  ui.autoMount();
}

export const main = createContentEntrypointShell({
  isEligible: isAnimePageShellEligible,
  mount: mountAnimePageUI,
  remove: removeAnimeUI,
  onError: (error, phase, url) => {
    log.error(`AniList anime page shell failed during ${phase}.`, { url }, error);
  },
});
