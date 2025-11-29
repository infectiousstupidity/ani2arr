// src/entrypoints/anichart-browse.content/index.tsx
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import ToastProvider from '@/shared/components/toast-provider';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { logger } from '@/shared/utils/logger';
import { extractMediaMetadataFromDom } from '@/shared/utils/anilist-dom';
import { mergeMetadataHints } from '@/shared/utils/media-metadata';
import type { AniFormat, MediaMetadataHint } from '@/shared/types';
import baseStyles from '@/shared/styles/base.css?inline';
import browseStyles from './style.css?inline';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';
import {
  createBrowseContentApp,
  DEFAULT_CONTAINER_CLASS,
  DEFAULT_PROCESSED_ATTRIBUTE,
  type BrowseAdapter,
  type ParsedCard,
} from '@/features/media-overlay';
import { awaitBackgroundReady } from '@/shared/utils/background-ready';
import { createPersistOptions } from '@/shared/utils/query-persist-options';
import { useMediaModalProps } from '@/shared/hooks/use-media-modal-props';
import { MediaModal } from '@/features/media-modal';
import { useMediaModalState } from '@/features/media-modal/hooks/use-media-modal-state';
import { ConfirmProvider } from '@/shared/hooks/use-confirm';
import { usePublicOptions } from '@/shared/hooks/use-api-queries';
import { useToast } from '@/shared/components/toast-provider';

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
// We render portals into containers attached to AniChart cover anchors (page DOM).
// Therefore we must inject styles into BOTH the shadow root and the page document.

const getSectionHeading = (card: Element): string =>
  card.closest('section')?.querySelector('h2')?.textContent?.trim() ?? '';

const shouldSkipCard = (card: Element): boolean => {
  const heading = getSectionHeading(card).toLowerCase();
  return heading.includes('movie') || heading.includes('music');
};

const parseYearFromHeading = (heading: string): number | null => {
  const match = heading.match(/(19|20|21)\d{2}/);
  return match ? Number.parseInt(match[0], 10) : null;
};

const inferFormatFromHeading = (heading: string): AniFormat | null => {
  const normalized = heading.toLowerCase();
  if (normalized.includes('short')) return 'TV_SHORT';
  if (normalized.includes('ova')) return 'OVA';
  if (normalized.includes('ona')) return 'ONA';
  if (normalized.includes('special')) return 'SPECIAL';
  if (normalized.includes('movie')) return 'MOVIE';
  if (normalized.includes('tv')) return 'TV';
  return null;
};

const metadataCache = new Map<number, MediaMetadataHint | null>();

const getCachedDomMetadata = (anilistId: number): MediaMetadataHint | null => {
  if (metadataCache.has(anilistId)) {
    return metadataCache.get(anilistId) ?? null;
  }
  const metadata = extractMediaMetadataFromDom(anilistId);
  metadataCache.set(anilistId, metadata ?? null);
  return metadata ?? null;
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

  const heading = getSectionHeading(card);
  const domMetadata = getCachedDomMetadata(anilistId);
  const fallbackMetadata: MediaMetadataHint = {
    titles: { romaji: title },
    synonyms: [title],
    startYear: parseYearFromHeading(heading),
    format: inferFormatFromHeading(heading),
    relationPrequelIds: null,
  };
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
  anchorCorner: 'top-left',
  stackDirection: 'down',
  anchorOffsetX: -8,
};

const BrowseContentApp = createBrowseContentApp(browseAdapter);

interface BrowseRootProps {
  portalContainer: HTMLElement;
}

const BrowseRoot: React.FC<BrowseRootProps> = ({ portalContainer }) => {
  const mediaModal = useMediaModalState();
  const { data: options } = usePublicOptions();
  const modalEnabled = options?.ui?.modalEnabled ?? true;
  const toast = useToast();

  const modalProps = useMediaModalProps({
    anilistId: mediaModal.state?.anilistId,
    title: mediaModal.state?.title,
    metadata: mediaModal.state?.metadata,
    portalContainer,
    isOpen: mediaModal.state?.isOpen ?? false,
  });

  return (
    <>
      <BrowseContentApp
        onOpenMediaModal={({ anilistId, title, initialTab, metadata }) => {
          if (!modalEnabled) {
            toast.showToast({
              title: 'Modal disabled',
              description: 'Enable the ani2arr modal in Options to open mapping/setup here.',
              variant: 'info',
            });
            return;
          }
          mediaModal.open({ anilistId, title, initialTab: initialTab ?? 'series', metadata });
        }}
      />
      {modalEnabled && portalContainer && mediaModal.state && modalProps && (
        <MediaModal
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
          portalContainer={portalContainer}
          mappingTabProps={modalProps.mappingTabProps}
          sonarrPanelProps={modalProps.sonarrPanelProps}
        />
      )}
    </>
  );
};

export default defineContentScript({
  matches: ['*://anichart.net/*', '*://www.anichart.net/*'],
  cssInjectionMode: 'ui',

  async main(ctx: ContentScriptContext) {
    // Ensure background is awake before rendering and kicking off any RPCs.
    await awaitBackgroundReady();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: Infinity,
          refetchOnWindowFocus: false,
          retry: false,
          gcTime: 30 * 60 * 1000,
        },
      },
    });

    const persistOptions = createPersistOptions(log);

    let ui: ShadowRootContentScriptUi<Root> | null = null;
    let root: Root | null = null;
    const cleanupDomArtifacts = () => {
      const containers = document.querySelectorAll<HTMLElement>(`.${DEFAULT_CONTAINER_CLASS}`);
      if (containers.length === 0) {
        return;
      }

      containers.forEach(container => {
        container.closest<HTMLAnchorElement>(COVER_SELECTOR)?.removeAttribute(DEFAULT_PROCESSED_ATTRIBUTE);
        container.remove();
      });
    };

    let globalStyleElement: HTMLStyleElement | null = null;
    let shadowStyleElement: HTMLStyleElement | null = null;

    const ensureGlobalStyles = () => {
      if (!globalStyleElement) {
        globalStyleElement = document.createElement('style');
        globalStyleElement.setAttribute('data-a2a-anichart', 'true');
        globalStyleElement.textContent = `${baseStyles}\n${browseStyles}`;
      }
      if (globalStyleElement && !document.head.contains(globalStyleElement)) {
        document.head.appendChild(globalStyleElement);
      }
    };

    const ensureShadowStyles = (shadowRoot: ShadowRoot) => {
      if (!shadowStyleElement) {
        shadowStyleElement = document.createElement('style');
        shadowStyleElement.setAttribute('data-a2a-anichart-shadow', 'true');
        shadowStyleElement.textContent = `${baseStyles}\n${browseStyles}`;
      }
      if (shadowStyleElement && shadowStyleElement.getRootNode() !== shadowRoot) {
        shadowRoot.appendChild(shadowStyleElement);
      }
    };

    const mount = async () => {
      if (ui) return;

      ensureGlobalStyles();

      ui = await createShadowRootUi(ctx, {
        name: 'a2a-anichart-root',
        position: 'inline',
        anchor: 'body',
        onMount: (container: HTMLElement, shadow: ShadowRoot) => {
          ensureShadowStyles(shadow);
          // Keep portals inside the shadow DOM so dialog overlays render correctly
          const portalContainer = container;
          root = createRoot(container);
          root.render(
            <React.StrictMode>
              <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
                <TooltipProvider>
                  <ToastProvider>
                    <ConfirmProvider portalContainer={portalContainer}>
                      <BrowseRoot portalContainer={portalContainer} />
                    </ConfirmProvider>
                  </ToastProvider>
                </TooltipProvider>
              </PersistQueryClientProvider>
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
        if (document.querySelector(`.${DEFAULT_CONTAINER_CLASS}`) || shadowStyleElement || globalStyleElement) {
          cleanupDomArtifacts();
        }
        return;
      }

      ui.remove();
      ui = null;
      root = null;
      cleanupDomArtifacts();
      if (shadowStyleElement?.parentNode) shadowStyleElement.parentNode.removeChild(shadowStyleElement);
      shadowStyleElement = null;
      if (globalStyleElement?.parentNode) globalStyleElement.parentNode.removeChild(globalStyleElement);
      globalStyleElement = null;
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
