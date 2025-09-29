// src/entrypoints/anilist-browse.content/index.tsx
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { persistQueryClient } from '@tanstack/query-persist-client-core';
import { idbQueryCachePersister } from '@/cache/cache-persister';
import { logger } from '@/utils/logger';
import browseStyles from './style.css?inline';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';
import {
  createBrowseContentApp,
  DEFAULT_CONTAINER_CLASS,
  DEFAULT_PROCESSED_ATTRIBUTE,
  type BrowseAdapter,
  type ParsedCard,
} from '@/ui/BrowseOverlay';

const log = logger.create('AniChart Browse Content');

const isAniChartSurface = (url: string): boolean => {
  try {
    const u = new URL(url);
    if (u.hostname !== 'anichart.net' && u.hostname !== 'www.anichart.net') return false;
    return true;
  } catch {
    return false;
  }
};

const CARD_SELECTOR = '.media-card';
const COVER_SELECTOR = 'a.cover';
const STYLE_DATA_ATTRIBUTE = 'data-kitsunarr-anichart';
const SHADOW_STYLE_DATA_ATTRIBUTE = 'data-kitsunarr-anichart-shadow';

const getSectionHeading = (card: Element): string =>
  card
    .closest('section')
    ?.querySelector('h2')
    ?.textContent
    ?.trim()
    .toLowerCase() ?? '';

const shouldSkipCard = (card: Element): boolean => {
  const heading = getSectionHeading(card);
  return heading.includes('movie') || heading.includes('music');
};

const extractTitle = (card: Element, cover: HTMLAnchorElement): string =>
  (card.querySelector<HTMLElement>('.overlay .title')?.textContent ?? '').trim() ||
  (cover.getAttribute('title') ?? '').trim() ||
  cover.querySelector('img')?.getAttribute('alt')?.trim() ||
  (card.querySelector<HTMLElement>('.data .header .title')?.textContent ?? '').trim() ||
  '';

const parseAniChartCard = (card: Element): ParsedCard | null => {
  const cover = card.querySelector<HTMLAnchorElement>(COVER_SELECTOR);
  if (!cover) return null;

  if (shouldSkipCard(card)) {
    return null;
  }

  const href = cover.getAttribute('href') ?? '';
  const idMatch = href.match(/anilist\.co\/anime\/(\d+)/i);
  const anilistId = idMatch ? Number(idMatch[1]) : NaN;
  if (!Number.isFinite(anilistId)) return null;

  const title = extractTitle(card, cover);
  if (!title) return null;

  return { anilistId, title, host: cover };
};

const ensureOverlayContainer = (cover: HTMLAnchorElement): HTMLElement => {
  const existing = cover.querySelector<HTMLElement>(`.${DEFAULT_CONTAINER_CLASS}`);
  if (existing) return existing;
  const el = cover.ownerDocument.createElement('div');
  el.className = DEFAULT_CONTAINER_CLASS;
  cover.appendChild(el);
  return el;
};

const locateExistingContainer = (card: Element): HTMLElement | null => {
  const cover = card.querySelector<HTMLElement>(COVER_SELECTOR);
  return (
    cover?.querySelector<HTMLElement>(`.${DEFAULT_CONTAINER_CLASS}`) ??
    card.querySelector<HTMLElement>(`.${DEFAULT_CONTAINER_CLASS}`)
  );
};

const clearProcessedAttribute = (card: Element): void => {
  card.querySelector<HTMLAnchorElement>(COVER_SELECTOR)?.removeAttribute(DEFAULT_PROCESSED_ATTRIBUTE);
};

const browseAdapter: BrowseAdapter = {
  cardSelector: CARD_SELECTOR,
  containerClassName: DEFAULT_CONTAINER_CLASS,
  processedAttribute: DEFAULT_PROCESSED_ATTRIBUTE,
  parseCard: parseAniChartCard,
  ensureContainer: ensureOverlayContainer,
  getContainerForCard: locateExistingContainer,
  onCardInvalid: clearProcessedAttribute,
  getObserverRoot: () => document.body ?? document.documentElement,
  getScanRoot: () => document.body ?? null,
  mutationObserverInit: {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href'],
  },
  resizeObserverTargets: () => (document.body ? [document.body] : []),
};

const BrowseContentApp = createBrowseContentApp(browseAdapter);

export default defineContentScript({
  matches: ['*://anichart.net/*', '*://www.anichart.net/*'],

  async main(ctx: ContentScriptContext) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: Infinity,
          refetchOnWindowFocus: false,
          retry: false,
        },
      },
    });

    const [unsubscribePersistence, restorePromise] = persistQueryClient({
      queryClient,
      persister: idbQueryCachePersister,
      maxAge: 1000 * 60 * 60 * 24,
    });

    try {
      await restorePromise;
    } catch (error) {
      log.warn('Failed to hydrate query cache', error);
    }

    ctx.onInvalidated(() => {
      unsubscribePersistence();
    });

    let ui: ShadowRootContentScriptUi<Root> | null = null;
    let root: Root | null = null;
    let globalStyleElement: HTMLStyleElement | null = null;
    let shadowStyleElement: HTMLStyleElement | null = null;

    const ensureGlobalStyles = () => {
      if (!globalStyleElement) {
        globalStyleElement = document.createElement('style');
        globalStyleElement.setAttribute(STYLE_DATA_ATTRIBUTE, 'true');
        globalStyleElement.textContent = browseStyles;
      }
      if (globalStyleElement && !document.head.contains(globalStyleElement)) {
        document.head.appendChild(globalStyleElement);
      }
    };

    const ensureShadowStyles = (shadowRoot: ShadowRoot) => {
      if (!shadowStyleElement) {
        shadowStyleElement = document.createElement('style');
        shadowStyleElement.setAttribute(SHADOW_STYLE_DATA_ATTRIBUTE, 'true');
        shadowStyleElement.textContent = browseStyles;
      }
      if (shadowStyleElement && shadowStyleElement.getRootNode() !== shadowRoot) {
        shadowRoot.appendChild(shadowStyleElement);
      }
    };

    const cleanupDomArtifacts = () => {
      const containers = document.querySelectorAll<HTMLElement>(`.${DEFAULT_CONTAINER_CLASS}`);
      if (containers.length === 0 && !shadowStyleElement && !globalStyleElement) {
        return;
      }

      containers.forEach(container => {
        container.closest<HTMLAnchorElement>(COVER_SELECTOR)?.removeAttribute(DEFAULT_PROCESSED_ATTRIBUTE);
        container.remove();
      });

      if (shadowStyleElement?.parentNode) {
        shadowStyleElement.parentNode.removeChild(shadowStyleElement);
      }
      shadowStyleElement = null;

      if (globalStyleElement?.parentNode) {
        globalStyleElement.parentNode.removeChild(globalStyleElement);
      }
      globalStyleElement = null;
    };

    const mount = async () => {
      if (ui) return;

      ensureGlobalStyles();

      ui = await createShadowRootUi(ctx, {
        name: 'kitsunarr-anichart-root',
        position: 'inline',
        anchor: 'body',
        onMount: (container: HTMLElement, shadow: ShadowRoot) => {
          ensureShadowStyles(shadow);
          root = createRoot(container);
          root.render(
            <React.StrictMode>
              <QueryClientProvider client={queryClient}>
                <TooltipProvider>
                  <BrowseContentApp />
                </TooltipProvider>
              </QueryClientProvider>
            </React.StrictMode>,
          );
          return root;
        },
        onRemove: (maybeRoot?: Root) => {
          (maybeRoot ?? root)?.unmount();
          root = null;
        },
      });

      await ui.mount();

      if (ui?.shadowHost) {
        ui.shadowHost.style.zIndex = '2147483647';
        ui.shadowHost.style.position = 'relative';
      }
    };

    const remove = async () => {
      if (!ui) {
        if (
          document.querySelector(`.${DEFAULT_CONTAINER_CLASS}`) ||
          shadowStyleElement ||
          globalStyleElement
        ) {
          cleanupDomArtifacts();
        }
        return;
      }

      ui.remove();
      ui = null;
      root = null;
      cleanupDomArtifacts();
    };

    const handleLocationChange = (url: string) => {
      if (isAniChartSurface(url)) void mount();
      else void remove();
    };

    handleLocationChange(location.href);

    type LocationChangeEvent = CustomEvent<{ newUrl: URL }>;

    ctx.addEventListener(
      window,
      'wxt:locationchange',
      (ev: Event) => {
        const e = ev as LocationChangeEvent;
        const href = e.detail?.newUrl?.href ?? location.href;
        handleLocationChange(href);
      },
      { capture: false },
    );

    ctx.onInvalidated(() => {
      void remove();
    });
  },
});
