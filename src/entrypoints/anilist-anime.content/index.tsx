// src/entrypoints/anilist-anime.content/index.tsx
import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM, { Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import ToastProvider, { useToast } from '@/shared/ui/feedback/toast-provider';
import { useTheme } from '@/shared/hooks/common/use-theme';
import { useSeriesStatus, useAddSeries, usePublicOptions } from '@/shared/queries';
import { useMediaModalProps } from '@/shared/hooks/entrypoints/use-media-modal-props';
import { useA2aBroadcasts } from '@/shared/hooks/use-broadcasts';
import MediaActions, { Status } from '@/shared/ui/media/media-actions';
import { logger } from '@/shared/utils/logger';
import { extractMediaMetadataFromDom } from '@/shared/anilist/dom/anilist-dom';
import { mergeMetadataHints } from '@/shared/anilist/media-metadata';
import type { MediaMetadataHint } from '@/shared/types';
import { MediaModal } from '@/features/media-modal';
import { useMediaModalState } from '@/features/media-modal/hooks/use-media-modal-state';
import '@/shared/styles/base.css';
import './style.css';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';
import { awaitBackgroundReady } from '@/shared/dom/background-ready';
import { ConfirmProvider } from '@/shared/hooks/common/use-confirm';

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

const ACTIONS_SELECTOR = '.header .cover-wrap .actions, .cover-wrap .actions';
const LIST_ROW_SELECTOR = '.actions .list';
const SIDEBAR_SELECTOR = '.content.container .sidebar';

const UI_NAME = 'a2a-anime-page-ui';
const ANCHOR_ID = 'a2a-actions-anchor';
const SPACER_ID = 'a2a-actions-spacer';

/* --------------------------------- Utils --------------------------------- */

function waitForElement(selector: string, root: ParentNode = document): Promise<Element> {
  return new Promise((resolve) => {
    const hit = root.querySelector(selector);
    if (hit) return resolve(hit);
    const mo = new MutationObserver(() => {
      const el = root.querySelector(selector);
      if (el) {
        mo.disconnect();
        resolve(el);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  });
}

const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);

function ensureActionsAnchor(): HTMLElement | null {
  const actions = q<HTMLElement>(ACTIONS_SELECTOR);
  if (!actions) return null;

  let anchor = actions.querySelector<HTMLElement>(`#${ANCHOR_ID}`);
  if (!anchor) {
    anchor = document.createElement('div');
    anchor.id = ANCHOR_ID;
    anchor.style.display = 'block';
    anchor.style.gridColumn = '1 / -1';
    anchor.style.justifySelf = 'stretch';
    anchor.style.margin = '0';
    anchor.style.width = 'auto';
    anchor.style.maxWidth = 'none';
    const listRow = actions.querySelector(LIST_ROW_SELECTOR);
    if (listRow) actions.insertBefore(anchor, listRow);
    else actions.prepend(anchor);
  }
  return anchor;
}

function startAnchorKeeper(): () => void {
  const heroRoot = q<HTMLElement>('.header .cover-wrap') ?? q<HTMLElement>('.cover-wrap') ?? document.body;
  ensureActionsAnchor();
  const mo = new MutationObserver(() => ensureActionsAnchor());
  mo.observe(heroRoot, { childList: true, subtree: true });
  return () => mo.disconnect();
}

function ensureSidebarSpacer(): HTMLElement | null {
  const sidebar = q<HTMLElement>(SIDEBAR_SELECTOR);
  if (!sidebar) return null;

  let spacer = sidebar.querySelector<HTMLElement>(`#${SPACER_ID}`);
  if (!spacer) {
    spacer = document.createElement('div');
    spacer.id = SPACER_ID;
    spacer.style.width = '100%';
    spacer.style.height = '0px';
    spacer.style.margin = '0';
    const rankings = sidebar.querySelector('.rankings');
    if (rankings) sidebar.insertBefore(spacer, rankings);
    else sidebar.prepend(spacer);
  }
  return spacer;
}

function syncSidebarOffset(spacer: HTMLElement | null): void {
  if (!spacer) return;
  const actions = q<HTMLElement>(ACTIONS_SELECTOR);
  const h = Math.ceil(actions?.getBoundingClientRect().height || 0);
  spacer.style.height = `${h + 8}px`;
}

function attachSizeSync(host: HTMLElement): () => void {
  Object.assign(host.style, {
    display: 'block',
    position: 'static',
    zIndex: 'auto',
    width: 'auto',
    maxWidth: '100%',
    margin: '0',
  });

  const spacer = ensureSidebarSpacer();
  const sync = () => {
    // Match AniList's native Add-to-List button width exactly to avoid sub-pixel drift.
    const nativeList = q<HTMLElement>('.actions .list');
    const listBox = nativeList?.getBoundingClientRect();
    const listWidth = listBox ? Math.round(listBox.width) : 165;
    host.style.width = `${listWidth}px`;

    const fav = q<HTMLElement>('.actions .favourite');
    const favBox = fav?.getBoundingClientRect();
    const favSide = favBox ? Math.round(Math.max(favBox.width, favBox.height)) : 35;
    host.style.setProperty('--a2a-fav-size', `${favSide}px`);
    syncSidebarOffset(spacer);
  };

  sync();

  const fav = q<HTMLElement>('.actions .favourite');
  const actions = q<HTMLElement>(ACTIONS_SELECTOR);
  const roFav = fav ? new ResizeObserver(sync) : null;
  if (fav && roFav) roFav.observe(fav);
  const roHost = new ResizeObserver(sync);
  roHost.observe(host);
  const roActions = actions ? new ResizeObserver(sync) : null;
  if (actions && roActions) roActions.observe(actions);
  window.addEventListener('resize', sync);

  return () => {
    roFav?.disconnect();
    roHost.disconnect();
    roActions?.disconnect();
    window.removeEventListener('resize', sync);
    q<HTMLElement>(`#${SPACER_ID}`)?.remove();
  };
}

function readFormatFromSidebar(doc: Document = document): string | null {
  const rows = Array.from(doc.querySelectorAll<HTMLDivElement>('.sidebar .data .data-set'));
  const formatRow = rows.find(r => r.querySelector('.type')?.textContent?.trim() === 'Format');
  const raw = formatRow?.querySelector('.value')?.textContent ?? '';
  const normalized = raw.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('movie')) return 'movie';
  if (normalized.includes('music')) return 'music';
  if (normalized === 'tv short') return 'tv_short';
  return normalized;
}

function shouldSkipByFormat(doc: Document = document): boolean {
  const fmt = readFormatFromSidebar(doc);
  return fmt === 'movie' || fmt === 'music';
}

/* -------------------------------- React UI -------------------------------- */

interface ContentRootProps {
  anilistId: number;
  title: string;
  metadata: MediaMetadataHint | null;
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
  const isConfigured = options?.isConfigured === true;
  const defaults = options?.defaults ?? null;
  const uiEnabled = options?.ui?.headerInjectionEnabled ?? true;
  const modalEnabled = options?.ui?.modalEnabled ?? true;

  useEffect(() => {
    (async () => {
      try {
        await awaitBackgroundReady();
      } catch {
        // non-blocking probe
      }
    })();
  }, []);

  const statusQuery = useSeriesStatus(
    { anilistId, title, metadata },
    {
      enabled: Boolean(anilistId && isConfigured),
      force_verify: true,
      ignoreFailureCache: true,
      priority: 'high',
    },
  );
  const addSeriesMutation = useAddSeries();

  const toast = useToast();

  const handleQuickAdd = () => {
    if (!isConfigured || !defaults) {
      toast.showToast({
        title: 'Sonarr not configured',
        description: 'Please configure your Sonarr settings first.',
        variant: 'info',
      });
      browser.runtime.openOptionsPage().catch(() => {});
      return;
    }
    addSeriesMutation.mutate({
      anilistId,
      title,
      primaryTitleHint: title,
      metadata,
      form: { ...defaults },
    });
  };

  const mappingUnavailable = statusQuery.data?.anilistTvdbLinkMissing === true;

  const getStatus = (): Status => {
    if (optionsPending) return 'LOADING';
    if (optionsError) return 'ERROR';
    if (!isConfigured) return 'ERROR';
    // Only show loading if fetching AND we don't have data yet (avoid flash when refetching)
    if (statusQuery.fetchStatus === 'fetching' && !statusQuery.data) return 'LOADING';
    if (statusQuery.isError || mappingUnavailable) return 'ERROR';
    if (statusQuery.data?.exists || addSeriesMutation.isSuccess) return 'IN';
    if (addSeriesMutation.isPending) return 'ADDING';
    if (addSeriesMutation.isError) return 'ERROR';
    return 'NOT_IN';
  };

  const status: Status = getStatus();

  const librarySlug =
    statusQuery.data?.series?.titleSlug ?? addSeriesMutation.data?.titleSlug ?? null;

  const resolvedSearchTerm = statusQuery.data?.successfulSynonym ?? title;

  const modalProps = useMediaModalProps({
    anilistId: mediaModal.state?.anilistId,
    title: mediaModal.state?.title,
    metadata: mediaModal.state?.metadata,
    portalContainer: hostElement,
    isOpen: mediaModal.state?.isOpen ?? false,
  });

  const tvdbId = mappingUnavailable ? null : statusQuery.data?.tvdbId ?? null;

  if (!uiEnabled) {
    return null;
  }

  return (
    <div ref={hostRef} style={{ width: '100%' }}>
      <ConfirmProvider portalContainer={hostElement ?? null}>
        <MediaActions
          service="sonarr"
          status={status}
          {...(librarySlug ? { librarySlug } : {})}
          resolvedSearchTerm={resolvedSearchTerm}
          externalId={tvdbId}
          onQuickAdd={handleQuickAdd}
          onOpenModal={() => {
            if (!modalEnabled) {
              toast.showToast({
                title: 'Modal disabled',
                description: 'Enable the ani2arr modal in Options to open mapping/setup here.',
                variant: 'info',
              });
              return;
            }
            mediaModal.open({
              anilistId,
              title,
              initialTab: 'series',
              metadata,
            });
          }}
          onOpenMappingFix={() => {
            if (!modalEnabled) {
              toast.showToast({
                title: 'Modal disabled',
                description: 'Enable the ani2arr modal in Options to adjust mappings here.',
                variant: 'info',
              });
              return;
            }
            mediaModal.open({
              anilistId,
              title,
              initialTab: 'mapping',
              metadata,
            });
          }}
          portalContainer={hostElement ?? undefined}
        />
        {modalEnabled && hostElement && mediaModal.state && modalProps && (
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
            tvdbId={modalProps.tvdbId}
            inLibrary={modalProps.inLibrary}
            format={modalProps.format}
            year={modalProps.year}
            status={modalProps.status}
            initialTab={mediaModal.state.initialTab ?? 'series'}
            portalContainer={hostElement}
            mappingTabProps={modalProps.mappingTabProps}
            sonarrPanelProps={modalProps.sonarrPanelProps}
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

async function mountAnimePageUI(
  ctx: ContentScriptContext,
  onMounted: () => void,
): Promise<void> {
  const idMatch = location.pathname.match(/\/anime\/(\d+)/);
  const anilistId = idMatch?.[1] ? parseInt(idMatch[1], 10) : null;
  if (!anilistId) return;

  await Promise.all([
    waitForElement(ACTIONS_SELECTOR),
    waitForElement(SIDEBAR_SELECTOR),
    waitForElement('h1'),
  ]);

  if (shouldSkipByFormat(document)) {
    try {
      ui?.remove();
    } catch (error) {
      log.error('Error removing UI on skip:', error);
    }
    ui = null;
    stopAnchorKeeper?.();
    stopAnchorKeeper = null;
    stopSizeSync?.();
    stopSizeSync = null;
    log.debug('AniList page skipped due to format being movie/music');
    return;
  }

  const title = document.querySelector('h1')?.textContent?.trim() ?? '';
  if (!title) return;

  const domMetadata = extractMediaMetadataFromDom(anilistId);
  const fallbackMetadata: MediaMetadataHint | null = title
    ? {
        titles: { romaji: title },
        synonyms: [title],
        startYear: null,
        format: null,
        relationPrequelIds: null,
      }
    : null;
  const metadata = mergeMetadataHints(domMetadata, fallbackMetadata);

  stopAnchorKeeper?.();
  stopAnchorKeeper = startAnchorKeeper();
  ensureActionsAnchor();

  if (ui) {
    ui.remove();
    stopSizeSync?.();
    ui = null;
    stopSizeSync = null;
  }

  ui = await createShadowRootUi(ctx, {
    name: UI_NAME,
    position: 'inline',
    anchor: `#${ANCHOR_ID}`,
    append: 'last',
    onMount: (uiContainer: HTMLElement, _shadow: ShadowRoot, shadowHost: HTMLElement): Root => {
      stopSizeSync = attachSizeSync(shadowHost);
      const root = ReactDOM.createRoot(uiContainer);
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ToastProvider>
              <ContentRoot anilistId={anilistId} title={title} metadata={metadata ?? null} />
            </ToastProvider>
          </TooltipProvider>
        </QueryClientProvider>,
      );
      return root;
    },
    onRemove: (mounted?: Root) => {
      mounted?.unmount();
      stopSizeSync?.();
      stopSizeSync = null;
    },
  });

  ui.autoMount();
  onMounted();
}

export default defineContentScript({
  matches: ['*://anilist.co/*'],
  cssInjectionMode: 'ui',
  runAt: 'document_end',
  async main(ctx: ContentScriptContext) {
    const removeAnimeUI = () => {
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
    };

    const route = async (url: string) => {
      if (ANIME_PAGE.includes(url)) {
        await mountAnimePageUI(ctx, () => {});
      } else {
        removeAnimeUI();
      }
    };

    await route(location.href);

    type LocationChangeEvent = CustomEvent<{ newUrl: URL }>;
    ctx.addEventListener(window, 'wxt:locationchange', (ev: Event) => {
      const event = ev as LocationChangeEvent;
      const href = event.detail?.newUrl?.href ?? location.href;
      route(href).catch(error => {
        log.error('Failed to handle location change:', error);
      });
    });

    ctx.onInvalidated(() => {
      removeAnimeUI();
    });
  }

});

export {
  waitForElement,
  ensureActionsAnchor,
  startAnchorKeeper,
  ensureSidebarSpacer,
  syncSidebarOffset,
  attachSizeSync,
};
