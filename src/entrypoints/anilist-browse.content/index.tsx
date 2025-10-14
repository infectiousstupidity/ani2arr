// src/entrypoints/anilist-browse.content/index.tsx
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { persistQueryClient } from '@tanstack/query-persist-client-core';
import { queryPersister, shouldPersistQuery } from '@/cache/query-cache';
import { logger } from '@/utils/logger';
import { extractMediaMetadataFromDom, mergeMetadataHints } from '@/utils/anilist-dom';
import type { MediaMetadataHint } from '@/types';
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
import { awaitBackgroundReady } from '@/utils/background-ready';

const log = logger.create('AniList Browse Content');

const isBrowseSurface = (url: string): boolean => {
  try {
    const u = new URL(url);
    if (u.hostname !== 'anilist.co') return false;
    const p = u.pathname;
    return p === '/' || p === '/home' || p.startsWith('/search/anime');
  } catch {
    return false;
  }
};

const CARD_SELECTOR = '.media-card';
const COVER_SELECTOR = 'a.cover';
const STYLE_DATA_ATTRIBUTE = 'data-kitsunarr-browse';
const SHADOW_STYLE_DATA_ATTRIBUTE = 'data-kitsunarr-browse-shadow';

const CARD_CONTAINER_SELECTORS = [
  '.media-grid',
  '.media-list',
  '.media-card-grid',
  '.media-card-wrap',
  '.page-content',
];

const metadataCache = new Map<number, MediaMetadataHint | null>();

const getCachedDomMetadata = (anilistId: number): MediaMetadataHint | null => {
  if (metadataCache.has(anilistId)) {
    return metadataCache.get(anilistId) ?? null;
  }
  const metadata = extractMediaMetadataFromDom(anilistId);
  metadataCache.set(anilistId, metadata ?? null);
  return metadata ?? null;
};

const shouldSkipFormat = (format: MediaMetadataHint['format']): boolean =>
  format === 'MOVIE' || format === 'MUSIC';

const findCardContainer = (): HTMLElement | null => {
  for (const selector of CARD_CONTAINER_SELECTORS) {
    const node = document.querySelector<HTMLElement>(selector);
    if (node) return node;
  }

  const firstCard = document.querySelector<HTMLElement>(CARD_SELECTOR);
  if (firstCard) {
    for (const selector of CARD_CONTAINER_SELECTORS) {
      const closest = firstCard.closest<HTMLElement>(selector);
      if (closest) return closest;
    }
    if (firstCard.parentElement instanceof HTMLElement) {
      return firstCard.parentElement;
    }
  }

  return document.querySelector<HTMLElement>('.page-content');
};

const parseAniListCard = (card: Element): ParsedCard | null => {
  const cover = card.querySelector<HTMLAnchorElement>(COVER_SELECTOR);
  if (!cover) return null;

  const title =
    (card.querySelector<HTMLDivElement>('.title a')?.textContent ?? '').trim() ||
    (card.querySelector<HTMLDivElement>('.title')?.textContent ?? '').trim() ||
    cover.getAttribute('title')?.trim() ||
    cover.querySelector('img')?.getAttribute('alt')?.trim() ||
    '';

  const href = cover.getAttribute('href') ?? '';
  const idMatch = href.match(/\/anime\/(\d+)/);
  const anilistId = idMatch ? Number(idMatch[1]) : NaN;

  if (!title || !Number.isFinite(anilistId)) return null;

  const domMetadata = getCachedDomMetadata(anilistId);
  if (shouldSkipFormat(domMetadata?.format ?? null)) return null;

  const fallbackMetadata: MediaMetadataHint | null = title
    ? {
        titles: title ? { romaji: title } : null,
        synonyms: title ? [title] : null,
        startYear: null,
        format: domMetadata?.format ?? null,
        relationPrequelIds: null,
      }
    : null;
  const metadata = mergeMetadataHints(domMetadata, fallbackMetadata);

  return { anilistId, title, host: cover, metadata: metadata ?? null };
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
  parseCard: parseAniListCard,
  ensureContainer: ensureOverlayContainer,
  getContainerForCard: locateExistingContainer,
  onCardInvalid: clearProcessedAttribute,
  getObserverRoot: () => document.body ?? document.documentElement,
  getScanRoot: () => findCardContainer(),
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
  matches: ['*://anilist.co/*'],

  async main(ctx: ContentScriptContext) {
    // Ensure background is awake before rendering and kicking off any RPCs.
    await awaitBackgroundReady();
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
      persister: queryPersister,
      maxAge: 24 * 60 * 60 * 1000, // 24h
      dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
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
        name: 'kitsunarr-browse-root',
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
      if (isBrowseSurface(url)) void mount();
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

