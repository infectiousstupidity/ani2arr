// src/entrypoints/anilist-anime.content/index.tsx

import React from 'react';
import ReactDOM, { Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTheme } from '@/hooks/use-theme';
import { useSeriesStatus, useAddSeries, useExtensionOptions } from '@/hooks/use-api-queries';
import SonarrActionGroup from '@/ui/SonarrActionGroup';
import './style.css';

import type { ContentScriptContext, ShadowRootContentScriptUi } from 'wxt/client';

const queryClient = new QueryClient();

const AddSeriesModal = React.lazy(() => import('@/ui/AddSeriesModal'));

const ANIME_PAGE = new MatchPattern('*://anilist.co/anime/*');

// AniList DOM
const ACTIONS_SELECTOR = '.header .cover-wrap .actions, .cover-wrap .actions';
const LIST_ROW_SELECTOR = '.actions .list';
const SIDEBAR_SELECTOR = '.content.container .sidebar';

// Our ids
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

/**
 * Insert our anchor before the native "Add to List" row and make it span both grid columns.
 * No explicit width - let AniList’s grid size it exactly like their rows.
 */
function ensureActionsAnchor(): HTMLElement | null {
  const actions = q<HTMLElement>(ACTIONS_SELECTOR);
  if (!actions) return null;

  let anchor = actions.querySelector<HTMLElement>(`#${ANCHOR_ID}`);
  if (!anchor) {
    anchor = document.createElement('div');
    anchor.id = ANCHOR_ID;

    // Make it behave as an Actions-row: full width across both grid tracks
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
  const heroRoot =
    q<HTMLElement>('.header .cover-wrap') ??
    q<HTMLElement>('.cover-wrap') ??
    document.body;

  ensureActionsAnchor();

  const mo = new MutationObserver(() => {
    ensureActionsAnchor();
  });
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

/** Sidebar offset = total height of the entire actions block (ours + native). */
function syncSidebarOffset(spacer: HTMLElement | null): void {
  if (!spacer) return;
  const actions = q<HTMLElement>(ACTIONS_SELECTOR);
  const h = Math.ceil(actions?.getBoundingClientRect().height || 0);
  spacer.style.height = `${h + 8}px`;
}

/**
 * Keep sidebar spacer and favourite size synced. Do not touch AniList layout.
 */
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
    // publish favourite size for our icon button
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

/* -------------------------------- React UI -------------------------------- */

interface ContentRootProps {
  anilistId: number;
  title: string;
}

const ContentRoot: React.FC<ContentRootProps> = ({ anilistId, title }) => {
  const hostRef = React.useRef<HTMLDivElement>(null);
  useTheme(hostRef);

  const [isModalOpen, setIsModalOpen] = React.useState(false);

  const { data: options } = useExtensionOptions();
  const isConfigured = !!options?.sonarrUrl && !!options.sonarrApiKey;

  const statusQuery = useSeriesStatus({ anilistId }, { enabled: !!anilistId, force_verify: true });
  const addSeriesMutation = useAddSeries();

  const handleQuickAdd = () => {
    if (!isConfigured) {
      alert('Please configure your Sonarr settings first.');
      browser.runtime.openOptionsPage();
      return;
    }
    addSeriesMutation.mutate({ anilistId, title });
  };

  const getStatus = (): 'LOADING' | 'IN_SONARR' | 'NOT_IN_SONARR' | 'ERROR' | 'ADDING' => {
    if (statusQuery.isLoading) return 'LOADING';
    if (statusQuery.isError) return 'ERROR';
    if (statusQuery.data?.exists) return 'IN_SONARR';
    if (addSeriesMutation.isPending) return 'ADDING';
    if (addSeriesMutation.isSuccess) return 'IN_SONARR';
    if (addSeriesMutation.isError) return 'ERROR';
    return 'NOT_IN_SONARR';
  };

  const tvdbId = statusQuery.data?.tvdbId;
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

async function mountAnimePageUI(ctx: ContentScriptContext): Promise<void> {
  // Parse ID from URL - stable on reload
  const idMatch = location.pathname.match(/\/anime\/(\d+)/);
  const anilistId = idMatch?.[1] ? parseInt(idMatch[1], 10) : null;
  if (!anilistId) return;

  // Wait for AniList to hydrate the hero + sidebar + title before reading them
  await Promise.all([
    waitForElement(ACTIONS_SELECTOR),
    waitForElement(SIDEBAR_SELECTOR),
    waitForElement('h1'),
  ]);

  // Now read title (was missing on hard refresh before hydration)
  const title = document.querySelector('h1')?.textContent?.trim() ?? '';

  // Keep/refresh the anchor across hydration swaps
  stopAnchorKeeper?.();
  stopAnchorKeeper = startAnchorKeeper();
  ensureActionsAnchor();

  // Clean previous instance (SPA back/forward)
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
          <ContentRoot anilistId={anilistId} title={title} />
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
  ui.mount();
}

export default defineContentScript({
  matches: ['*://anilist.co/*'],
  cssInjectionMode: 'ui',
  runAt: 'document_end',
  async main(ctx: ContentScriptContext) {
    const route = async (url: string) => {
      if (!ANIME_PAGE.includes(url)) return;
      await mountAnimePageUI(ctx);
    };

    await route(location.href);

    ctx.addEventListener(window, 'wxt:locationchange', async (e: Event & { newUrl: URL }) => {
      await route(e.newUrl.href);
    });
  },
});
