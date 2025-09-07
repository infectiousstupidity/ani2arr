// src/entrypoints/anilist-anime.content/index.tsx

import React from 'react';
import ReactDOM, { Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTheme } from '@/hooks/use-theme';
import { useSeriesStatus, useAddSeries, useExtensionOptions } from '@/hooks/use-api-queries';
import SonarrActionGroup from '@/ui/SonarrActionGroup';
import './style.css';

import type { ContentScriptContext, ShadowRootContentScriptUi } from 'wxt/client';

/**
 * Requirements
 * - Renders directly under AniList “Add to List” with identical width/spacing.
 * - Never overlaps the `.rankings` area (sidebar). Works when rankings are missing.
 * - Reliable on SPA navigation AND hard refresh / opening a URL in a new tab.
 * - Survives AniList re-renders that replace the hero header.
 */

/* ============================================================================
 * Constants
 * ========================================================================== */

const queryClient = new QueryClient();

const ANIME_PAGE = new MatchPattern('*://anilist.co/anime/*');

// Left column (hero) selectors
const ACTIONS_SELECTOR = '.header .cover-wrap .actions, .cover-wrap .actions';
const LIST_ROW_SELECTOR = '.actions .list'; // full row: "Add to List" + caret

// Sidebar selector (for rankings/data)
const SIDEBAR_SELECTOR = '.content.container .sidebar';

// Our DOM ids
const UI_NAME = 'kitsunarr-anime-page-ui';
const ANCHOR_ID = 'kitsunarr-actions-anchor'; // WXT anchor
const SPACER_ID = 'kitsunarr-actions-spacer'; // top of sidebar spacer

/* ============================================================================
 * DOM Utilities
 * ========================================================================== */

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

/** Create/ensure a persistent anchor directly under the hero actions block. */
function ensureActionsAnchor(): HTMLElement | null {
  const actions = q<HTMLElement>(ACTIONS_SELECTOR);
  if (!actions) return null;

  let anchor = actions.querySelector<HTMLElement>(`#${ANCHOR_ID}`);
  if (!anchor) {
    anchor = document.createElement('div');
    anchor.id = ANCHOR_ID;
    anchor.style.display = 'block';
    anchor.style.marginTop = '12px'; // match AniList vertical rhythm
    anchor.style.marginBottom = '0';
    actions.appendChild(anchor);
  }
  return anchor;
}

/**
 * Anchor keeper.
 * AniList re-renders the hero; this recreates our anchor whenever it disappears.
 * Run BEFORE creating/mounting the WXT UI so autoMount() has a target.
 */
function startAnchorKeeper(): () => void {
  const heroRoot =
    q<HTMLElement>('.header .cover-wrap') ??
    q<HTMLElement>('.cover-wrap') ??
    document.body;

  // Insert immediately if possible.
  ensureActionsAnchor();

  const mo = new MutationObserver(() => {
    ensureActionsAnchor();
  });
  mo.observe(heroRoot, { childList: true, subtree: true });

  return () => mo.disconnect();
}

/** Ensure a single spacer at the very top of the sidebar (above `.rankings` when present). */
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

/** Match anchor width to the full native list row width. */
function syncAnchorWidth(anchor: HTMLElement): void {
  const row = q<HTMLElement>(LIST_ROW_SELECTOR);
  const w = row?.getBoundingClientRect().width;
  const px = w && Number.isFinite(w) ? `${Math.round(w)}px` : '240px';
  anchor.style.width = px;
  anchor.style.maxWidth = px;
}

/** Make sidebar start visually below our injected controls. */
function syncSpacerHeight(host: HTMLElement, spacer: HTMLElement | null): void {
  if (!spacer) return;
  const h = Math.ceil(host.getBoundingClientRect().height || 0);
  spacer.style.height = `${h + 8}px`; // small breathing room
}

/** After mount: keep width/spacer synced to layout changes. */
function attachSizeSync(host: HTMLElement): () => void {
  // Host fills the anchor; anchor carries spacing/width.
  Object.assign(host.style, {
    display: 'block',
    position: 'static',
    zIndex: 'auto',
    width: '100%',
    maxWidth: '100%',
    margin: '0',
  });

  const anchor = q<HTMLElement>(`#${ANCHOR_ID}`);
  const spacer = ensureSidebarSpacer();

  if (anchor) syncAnchorWidth(anchor);
  syncSpacerHeight(host, spacer);

  // Observe the native list row for width changes (fonts/responsive/reflows).
  const listRow = q<HTMLElement>(LIST_ROW_SELECTOR);
  const roRow = listRow
    ? new ResizeObserver(() => {
        const a = q<HTMLElement>(`#${ANCHOR_ID}`);
        if (a) syncAnchorWidth(a);
        syncSpacerHeight(host, q<HTMLElement>(`#${SPACER_ID}`));
      })
    : null;
  if (listRow && roRow) roRow.observe(listRow);

  // Observe our host for height changes (button state changes).
  const roHost = new ResizeObserver(() => {
    syncSpacerHeight(host, q<HTMLElement>(`#${SPACER_ID}`));
  });
  roHost.observe(host);

  const onResize = () => {
    const a = q<HTMLElement>(`#${ANCHOR_ID}`);
    if (a) syncAnchorWidth(a);
    syncSpacerHeight(host, q<HTMLElement>(`#${SPACER_ID}`));
  };
  window.addEventListener('resize', onResize);

  return () => {
    roRow?.disconnect();
    roHost.disconnect();
    window.removeEventListener('resize', onResize);
    q<HTMLElement>(`#${SPACER_ID}`)?.remove();
  };
}

/* ============================================================================
 * React UI
 * ========================================================================== */

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
    <div ref={hostRef}>
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
        {isModalOpen && hostRef.current &&
          React.createElement(React.lazy(() => import('@/ui/AddSeriesModal')), {
            anilistId,
            title,
            isOpen: isModalOpen,
            onClose: () => setIsModalOpen(false),
            portalContainer: hostRef.current,
          })}
      </React.Suspense>
    </div>
  );
};

/* ============================================================================
 * Content-script bootstrap (SPA + hard refresh safe)
 * ========================================================================== */

let ui: ShadowRootContentScriptUi<Root> | null = null;
let stopAnchorKeeper: (() => void) | null = null;
let stopSizeSync: (() => void) | null = null;

async function mountAnimePageUI(ctx: ContentScriptContext): Promise<void> {
  const idMatch = location.pathname.match(/\/anime\/(\d+)/);
  const anilistId = idMatch?.[1] ? parseInt(idMatch[1], 10) : null;
  const title = document.querySelector('h1')?.textContent?.trim() ?? null;
  if (!anilistId || !title) return;

  // Wait for base containers on first paint.
  await Promise.all([waitForElement(ACTIONS_SELECTOR), waitForElement(SIDEBAR_SELECTOR)]);

  // Start the anchor keeper BEFORE creating the UI so autoMount() has a target.
  stopAnchorKeeper?.();
  stopAnchorKeeper = startAnchorKeeper();
  ensureActionsAnchor();

  // Clean previous instance (SPA back/forward).
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

  // Critical order for hard refresh/new tab reliability:
  // 1) Begin automatic mount/remove watcher.
  ui.autoMount();
  // 2) Eagerly mount now (works when anchor is already present).
  ui.mount();
}

export default defineContentScript({
  matches: ['*://anilist.co/*'], // broad to handle SPA transitions
  cssInjectionMode: 'ui',
  runAt: 'document_end',         // set up before site hydration replaces DOM
  async main(ctx: ContentScriptContext) {
    const route = async (url: string) => {
      if (!ANIME_PAGE.includes(url)) return;
      await mountAnimePageUI(ctx);
    };

    // Initial load (works on direct URL and hard refresh).
    await route(location.href);

    // SPA navigation.
    ctx.addEventListener(window, 'wxt:locationchange', async (e: Event & { newUrl: URL }) => {
      await route(e.newUrl.href);
    });
  },
});
