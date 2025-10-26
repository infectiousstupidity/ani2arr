// src/entrypoints/anilist-anime.content/index.tsx
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM, { Root } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useTheme } from '@/hooks/use-theme';
import { useSeriesStatus, useAddSeries, usePublicOptions } from '@/hooks/use-api-queries';
import { useKitsunarrBroadcasts } from '@/hooks/use-broadcasts';
import { createPersistOptions } from '@/utils/query-persist-options';
import SonarrActionGroup from '@/ui/SonarrActionGroup';
import { logger } from '@/utils/logger';
import { extractMediaMetadataFromDom } from '@/utils/anilist-dom';
import { mergeMetadataHints } from '@/utils/media-metadata';
import type { MediaMetadataHint } from '@/types';
import './style.css';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';
import { awaitBackgroundReady } from '@/utils/background-ready';

const log = logger.create('AniList Content');

const queryClient = new QueryClient();
const persistOptions = createPersistOptions(log);

const AddSeriesModal = React.lazy(() => import('@/ui/AddSeriesModal'));

const ANIME_PAGE = new MatchPattern('*://anilist.co/anime/*');

const ACTIONS_SELECTOR = '.header .cover-wrap .actions, .cover-wrap .actions';
const LIST_ROW_SELECTOR = '.actions .list';
const SIDEBAR_SELECTOR = '.content.container .sidebar';

const UI_NAME = 'kitsunarr-anime-page-ui';
const ANCHOR_ID = 'kitsunarr-actions-anchor';
const SPACER_ID = 'kitsunarr-actions-spacer';

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
    width: '100%',
    maxWidth: '100%',
    margin: '0',
  });

  const spacer = ensureSidebarSpacer();
  const sync = () => {
    const fav = q<HTMLElement>('.actions .favourite');
    const favBox = fav?.getBoundingClientRect();
    const favSide = favBox ? Math.round(Math.max(favBox.width, favBox.height)) : 35;
    host.style.setProperty('--kitsunarr-fav-size', `${favSide}px`);
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

// NEW: robustly read the "Format" value from the AniList sidebar
function readFormatFromSidebar(doc: Document = document): string | null {
  const rows = Array.from(doc.querySelectorAll<HTMLDivElement>('.sidebar .data .data-set'));
  const formatRow = rows.find(r => r.querySelector('.type')?.textContent?.trim() === 'Format');
  const raw = formatRow?.querySelector('.value')?.textContent ?? '';
  const normalized = raw.replace(/\s+/g, ' ').trim().toLowerCase(); // e.g. "movie", "tv short"
  if (!normalized) return null;

  // Normalize common enum spellings
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
  const hostRef = useRef<HTMLDivElement>(null);
  useTheme(hostRef);
  useKitsunarrBroadcasts();

  const [isModalOpen, setIsModalOpen] = useState(false);
  // In unit tests, don't block on background readiness to avoid long LOADING states.
  const isTestEnv = typeof import.meta !== 'undefined' && typeof import.meta.env !== 'undefined' && import.meta.env.MODE === 'test';
  const [backgroundReady, setBackgroundReady] = useState<boolean>(isTestEnv);
  const { data: options } = usePublicOptions();
  const isConfigured = Boolean(options?.isConfigured);
  const defaults = options?.defaults ?? null;

  // Kick off background readiness probe without blocking initial render
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await awaitBackgroundReady();
        if (mounted) setBackgroundReady(true);
      } catch {
        // If ping fails repeatedly, we still allow the UI to remain interactive; the query will surface errors.
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const statusQuery = useSeriesStatus(
    { anilistId, title, metadata },
    {
      // Only fire the status query once background is ready to avoid proxy races,
      // but render the UI immediately while we wait.
      enabled: Boolean(anilistId && isConfigured && (backgroundReady || isTestEnv)),
      force_verify: true,
      ignoreFailureCache: true,
    },
  );
  const addSeriesMutation = useAddSeries();

  const handleQuickAdd = () => {
    if (!isConfigured || !defaults) {
      alert('Please configure your Sonarr settings first.');
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
  const tvdbId = mappingUnavailable ? null : statusQuery.data?.tvdbId;

  const getStatus = (): 'LOADING' | 'IN_SONARR' | 'NOT_IN_SONARR' | 'ERROR' | 'ADDING' => {
    if (!isConfigured) return 'ERROR';
    // While background is booting, show a loading state even before the query fires
    if (!backgroundReady && !isTestEnv) return 'LOADING';
    if (statusQuery.fetchStatus === 'fetching') return 'LOADING';
    if (statusQuery.isError || mappingUnavailable) return 'ERROR';
    if (statusQuery.data?.exists || addSeriesMutation.isSuccess) return 'IN_SONARR';
    if (addSeriesMutation.isPending) return 'ADDING';
    if (addSeriesMutation.isError) return 'ERROR';
    return 'NOT_IN_SONARR';
  };

  const resolvedSearchTerm = statusQuery.data?.successfulSynonym ?? title;

  return (
    <div ref={hostRef} style={{ width: '100%' }}>
      <SonarrActionGroup
        status={getStatus()}
        seriesTitleSlug={statusQuery.data?.series?.titleSlug ?? addSeriesMutation.data?.titleSlug}
        animeTitle={title}
        resolvedSearchTerm={resolvedSearchTerm}
        tvdbId={tvdbId}
        onQuickAdd={handleQuickAdd}
        onOpenModal={() => setIsModalOpen(true)}
        portalContainer={hostRef.current ?? undefined}
      />
      <React.Suspense fallback={null}>
        {isModalOpen && hostRef.current && (
          <AddSeriesModal
            anilistId={anilistId}
            title={title}
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            metadata={metadata}
            portalContainer={hostRef.current}
          />
        )}
      </React.Suspense>
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
  // Do not block UI render on background readiness; ContentRoot will gate the query.
  const idMatch = location.pathname.match(/\/anime\/(\d+)/);
  const anilistId = idMatch?.[1] ? parseInt(idMatch[1], 10) : null;
  if (!anilistId) return;

  await Promise.all([
    waitForElement(ACTIONS_SELECTOR),
    waitForElement(SIDEBAR_SELECTOR),
    waitForElement('h1'),
  ]);

  // NEW: skip movie/music pages entirely
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
  if (!title) return; // Don't mount if we can't get a title

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
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <TooltipProvider>
            <ContentRoot anilistId={anilistId} title={title} metadata={metadata ?? null} />
          </TooltipProvider>
        </PersistQueryClientProvider>,
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
  ui.mount();
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
