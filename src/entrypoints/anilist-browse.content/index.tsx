// src/entrypoints/anilist-browse.content/index.tsx
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { persistQueryClient } from '@tanstack/query-persist-client-core';
import { useAddSeries, useExtensionOptions, useSeriesStatus } from '@/hooks/use-api-queries';
import { useTheme } from '@/hooks/use-theme';
import TooltipWrapper from '@/ui/TooltipWrapper';
import { CheckIcon, ExclamationTriangleIcon, GearIcon, PlusIcon } from '@radix-ui/react-icons';
import { idbQueryCachePersister } from '@/utils/cache-persister';
import { logger } from '@/utils/logger';
import type { ExtensionError } from '@/types';
import type { AniFormat } from '@/api/anilist.api';
import browseStyles from './style.css?inline';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';

/* ====================== Page targeting ====================== */

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

/* ====================== DOM constants ====================== */

const CARD_SELECTOR = '.media-card';
const COVER_SELECTOR = 'a.cover';
const INJECTION_CONTAINER_CLASS = 'kitsunarr-overlay-container';
const PROCESSED_ATTRIBUTE = 'data-kitsunarr-processed';
const STYLE_DATA_ATTRIBUTE = 'data-kitsunarr-browse';
const SHADOW_STYLE_DATA_ATTRIBUTE = 'data-kitsunarr-browse-shadow';

const log = logger.create('AniList Browse Content');

type MediaCardElement = Element & {
  __vue__?: {
    $props?: { media?: { format?: AniFormat | null } };
    media?: { format?: AniFormat | null };
  };
};

const FORMAT_TEXT_MAP = new Map<string, AniFormat>([
  ['tv show', 'TV'],
  ['tv', 'TV'],
  ['tv short', 'TV_SHORT'],
  ['ona', 'ONA'],
  ['ova', 'OVA'],
  ['movie', 'MOVIE'],
  ['special', 'SPECIAL'],
  ['music', 'MUSIC'],
]);

const normalizeFormatText = (value: string): string =>
  value.toLowerCase().trim().replace(/\s+series$/, '');

const detectCardFormat = (card: Element): AniFormat | null => {
  const infoSpan = card.querySelector<HTMLSpanElement>('.hover-data .info span');
  const infoText = infoSpan?.textContent;
  if (infoText) {
    const normalized = normalizeFormatText(infoText);
    const mapped = FORMAT_TEXT_MAP.get(normalized);
    if (mapped) return mapped;
  }

  const cardWithVue = card as MediaCardElement;
  const mediaFormat =
    cardWithVue.__vue__?.$props?.media?.format ?? cardWithVue.__vue__?.media?.format ?? null;

  return typeof mediaFormat === 'string' ? (mediaFormat as AniFormat) : null;
};

const shouldSkipFormat = (format: AniFormat | null | undefined): boolean =>
  format === 'MOVIE' || format === 'MUSIC';

const AddSeriesModal = React.lazy(() => import('@/ui/AddSeriesModal'));

type ModalState = { anilistId: number; title: string };

/* ====================== Card overlay ====================== */

type OverlayState = 'disabled' | 'in-sonarr' | 'addable' | 'resolving' | 'adding' | 'error';

interface CardOverlayDescriptor {
  anilistId: number;
  title: string;
  onOpenModal: (anilistId: number, title: string) => void;
}

interface CardOverlayProps extends CardOverlayDescriptor {
  isConfigured: boolean;
}

const CardOverlay: React.FC<CardOverlayProps> = memo(({ anilistId, title, onOpenModal, isConfigured }) => {
  const bypassFailureCacheRef = useRef(false);
  const statusQuery = useSeriesStatus(
    { anilistId, title },
    { enabled: Number.isFinite(anilistId), ignoreFailureCache: () => bypassFailureCacheRef.current },
  );
  const addSeriesMutation = useAddSeries();


  const {
    data: statusData,
    isError: statusHasError,
    error: statusError,
    isLoading: statusIsLoading,
    fetchStatus,
    refetch,
  } = statusQuery;

  const {
    mutate,
    isPending: isAdding,
    isSuccess: addSuccess,
    isError: addHasError,
    error: addError,
    reset,
  } = addSeriesMutation;

  useEffect(() => {
    reset();
  }, [anilistId, title, reset]);

  const isResolving = statusIsLoading || fetchStatus === 'fetching';
  const hasError = addHasError || statusHasError;
  const alreadyInSonarr = !!statusData?.exists || addSuccess;

  const overlayState: OverlayState = useMemo(() => {
    if (!isConfigured) return 'disabled';
    if (alreadyInSonarr) return 'in-sonarr';
    if (hasError) return 'error';
    if (isAdding) return 'adding';
    if (isResolving) return 'resolving';
    return 'addable';
  }, [alreadyInSonarr, hasError, isAdding, isConfigured, isResolving]);

  const resolveErrorMessage = (error: unknown): string | null => {
    if (!error) return null;
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error !== null && 'userMessage' in (error as ExtensionError)) {
      const { userMessage } = error as ExtensionError;
      if (typeof userMessage === 'string' && userMessage.trim().length > 0) return userMessage;
    }
    if (error instanceof Error) return error.message;
    return null;
  };

  const errorMessage = resolveErrorMessage(addError) ?? resolveErrorMessage(statusError);

  const quickAddDisabled = overlayState === 'in-sonarr' || overlayState === 'resolving' || overlayState === 'adding';

  const quickAddTitle = (() => {
    switch (overlayState) {
      case 'in-sonarr':
        return 'Already in Sonarr';
      case 'addable':
        return 'Quick add to Sonarr';
      case 'resolving':
        return 'Resolving series mapping…';
      case 'adding':
        return 'Adding to Sonarr…';
      case 'error':
        return errorMessage ? `Retry Sonarr add (${errorMessage})` : 'Retry Sonarr add';
      case 'disabled':
        return 'Configure Sonarr before adding';
      default:
        return 'Sonarr';
    }
  })();

  const quickAddAriaLabel = overlayState === 'error' ? 'Retry adding to Sonarr' : quickAddTitle;

  const swallowEvent = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleQuickAdd = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      swallowEvent(event);

      if (!isConfigured) {
        alert('Please configure your Sonarr settings first.');
        browser.runtime.openOptionsPage().catch(() => {});
        return;
      }

      if (overlayState === 'in-sonarr' || overlayState === 'resolving' || overlayState === 'adding') {
        return;
      }

      if (overlayState === 'error') {
        if (addHasError) {
          reset();
          mutate({ anilistId, title });
          return;
        }
        if (statusHasError) {
          bypassFailureCacheRef.current = true;
          void refetch({ throwOnError: false })
            .catch(() => {})
            .finally(() => {
              bypassFailureCacheRef.current = false;
            });
          return;
        }
      }

      mutate({ anilistId, title });
    },
    [
      addHasError,
      anilistId,
      bypassFailureCacheRef,
      isConfigured,
      mutate,
      overlayState,
      refetch,
      reset,
      statusHasError,
      swallowEvent,
      title,
    ],
  );

  const handleOpenAdvanced = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      swallowEvent(event);
      if (overlayState === 'resolving' || overlayState === 'adding') return;
      onOpenModal(anilistId, title);
    },
    [anilistId, onOpenModal, overlayState, swallowEvent, title],
  );

  const quickAddIcon = (() => {
    switch (overlayState) {
      case 'resolving':
      case 'adding':
        return <span className="kitsunarr-card-overlay__spinner" aria-hidden="true" />;
      case 'in-sonarr':
        return <CheckIcon className="kitsunarr-card-overlay__symbol" aria-hidden="true" />;
      case 'error':
        return <ExclamationTriangleIcon className="kitsunarr-card-overlay__symbol" aria-hidden="true" />;
      default:
        return <PlusIcon className="kitsunarr-card-overlay__symbol" aria-hidden="true" />;
    }
  })();

  const quickAddTooltip = quickAddTitle;
  const tooltipContainer = useMemo(() => (typeof document !== 'undefined' ? document.body : null), []);

  const showAdvancedButton = overlayState === 'addable';
  const advancedDisabled = false;

  return (
    <div className="kitsunarr-card-overlay" data-state={overlayState}>
      <TooltipWrapper
        content={quickAddTooltip}
        side="top"
        align="start"
        sideOffset={6}
        container={tooltipContainer}
      >
        <button
          type="button"
          className="kitsunarr-card-overlay__quick"
          data-state={overlayState}
          aria-label={quickAddAriaLabel}
          onClick={handleQuickAdd}
          onMouseDown={swallowEvent}
          disabled={quickAddDisabled}
          aria-disabled={quickAddDisabled || undefined}
        >
          {quickAddIcon}
        </button>
      </TooltipWrapper>

      {showAdvancedButton && (
        <div className="kitsunarr-card-overlay__gear-shell" data-state={overlayState}>
          <TooltipWrapper
            content="Advanced Sonarr options"
            side="top"
            align="start"
            sideOffset={6}
            container={tooltipContainer}
          >
            <button
              type="button"
              className="kitsunarr-card-overlay__gear"
              aria-label="Open advanced Sonarr options"
              onClick={handleOpenAdvanced}
              onMouseDown={swallowEvent}
              disabled={advancedDisabled}
              aria-disabled={advancedDisabled || undefined}
            >
              <GearIcon aria-hidden="true" />
            </button>
          </TooltipWrapper>
        </div>
      )}
    </div>
  );
});
CardOverlay.displayName = 'CardOverlay';

/* ====================== Root app ====================== */

const BrowseContentApp: React.FC = () => {
  const hostRef = useRef<HTMLDivElement>(null);
  useTheme(hostRef);

  const { data: extensionOptions } = useExtensionOptions();
  const isConfigured = Boolean(extensionOptions?.sonarrUrl && extensionOptions?.sonarrApiKey);

  const [cardPortals, setCardPortals] = useState<Map<Element, CardOverlayDescriptor>>(new Map());
  const [modalState, setModalState] = useState<ModalState | null>(null);

  const handleOpenModal = useCallback((anilistId: number, title: string) => {
    setModalState({ anilistId, title });
  }, []);

  const handleCloseModal = useCallback(() => setModalState(null), []);

  useEffect(() => {
    const fallbackObserverRoot =
      document.querySelector<HTMLElement>('.page-content') ?? document.body ?? document.documentElement;
    if (!fallbackObserverRoot) return;

    const CARD_CONTAINER_SELECTORS = ['.media-grid', '.media-list', '.media-card-grid', '.media-card-wrap'];

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

    const getScanRoot = (): HTMLElement | null => findCardContainer();

    const parseCard = (card: Element): (CardOverlayDescriptor & { host: HTMLAnchorElement }) | null => {
      const cover = card.querySelector<HTMLAnchorElement>(COVER_SELECTOR);
      if (!cover) return null;

      const format = detectCardFormat(card);
      if (shouldSkipFormat(format)) return null;

      const title =
        (card.querySelector<HTMLDivElement>('.title a')?.textContent ?? '').trim() ||
        (card.querySelector<HTMLDivElement>('.title')?.textContent ?? '').trim() ||
        cover.getAttribute('title')?.trim() ||
        cover.querySelector('img')?.getAttribute('alt')?.trim() ||
        '';

      const href = cover.href || '';
      const idMatch = href.match(/\/anime\/(\d+)/);
      const anilistId = idMatch ? Number(idMatch[1]) : NaN;

      if (!title || !Number.isFinite(anilistId)) return null;
      return { anilistId, title, onOpenModal: handleOpenModal, host: cover };
    };

    const ensureContainer = (cover: HTMLAnchorElement): HTMLElement => {
      const existing = cover.querySelector<HTMLElement>(`.${INJECTION_CONTAINER_CLASS}`);
      if (existing) return existing;
      const el = document.createElement('div');
      el.className = INJECTION_CONTAINER_CLASS;
      cover.appendChild(el);
      return el;
    };

    const upsertCard = (card: Element) => {
      const parsed = parseCard(card);
      if (!parsed) {
        const cover = card.querySelector<HTMLAnchorElement>(COVER_SELECTOR);
        const fallbackContainer =
          cover?.querySelector<HTMLElement>(`.${INJECTION_CONTAINER_CLASS}`) ??
          card.querySelector<HTMLElement>(`.${INJECTION_CONTAINER_CLASS}`);

        cover?.removeAttribute(PROCESSED_ATTRIBUTE);

        if (fallbackContainer) {
          fallbackContainer
            .closest<HTMLAnchorElement>(COVER_SELECTOR)
            ?.removeAttribute(PROCESSED_ATTRIBUTE);

          setCardPortals(prev => {
            if (!prev.has(fallbackContainer)) return prev;
            const next = new Map(prev);
            next.delete(fallbackContainer);
            return next;
          });
        }

        return;
      }

      const { host, ...props } = parsed;
      const container = ensureContainer(host);
      const idValue = String(props.anilistId);
      if (host.getAttribute(PROCESSED_ATTRIBUTE) !== idValue) {
        host.setAttribute(PROCESSED_ATTRIBUTE, idValue);
      }

      setCardPortals(prev => {
        const previous = prev.get(container);
        if (previous && previous.anilistId === props.anilistId && previous.title === props.title) {
          return prev;
        }
        const next = new Map(prev);
        next.set(container, props);
        return next;
      });
    };

    const removeStalePortals = () => {
      setCardPortals(prev => {
        if (prev.size === 0) return prev;
        let changed = false;
        const next = new Map(prev);
        for (const container of prev.keys()) {
          if (!document.contains(container)) {
            container.closest<HTMLAnchorElement>(COVER_SELECTOR)?.removeAttribute(PROCESSED_ATTRIBUTE);
            next.delete(container);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };

    const scanAll = () => {
      const scanRoot = getScanRoot();
      if (!scanRoot) {
        removeStalePortals();
        return;
      }

      const cards = scanRoot.querySelectorAll(CARD_SELECTOR);
      if (cards.length === 0) {
        removeStalePortals();
        return;
      }
      cards.forEach(card => upsertCard(card));
      removeStalePortals();
    };

    scanAll();

    const observerOptions: MutationObserverInit = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href'],
    };

    const pendingCards = new Set<Element>();
    let needsFullRescan = false;
    let rafId: number | null = null;
    let observedTarget: Node | null = null;
    let resizeTarget: Element | null = null;

    let mo: MutationObserver | null = null;
    let ro: ResizeObserver | null = null;

    const enqueueCardForNode = (node: Node | null | undefined) => {
      if (!node) return;
      const element = node instanceof Element ? node : node.parentElement;
      const card = element?.closest?.(CARD_SELECTOR);
      if (card) {
        pendingCards.add(card);
      }
    };

    const ensureObserverTarget = () => {
      const next = findCardContainer() ?? fallbackObserverRoot;
      if (!next) return null;
      if (observedTarget === next) return next;
      if (mo) {
        mo.disconnect();
        mo.observe(next, observerOptions);
      }
      observedTarget = next;
      return next;
    };

    const syncResizeObserver = () => {
      const next = findCardContainer();
      if (resizeTarget === next) return;
      if (resizeTarget && ro) {
        ro.unobserve(resizeTarget);
      }
      if (next && ro) {
        ro.observe(next);
      }
      resizeTarget = next ?? null;
    };

    const flushMutations = () => {
      ensureObserverTarget();
      if (needsFullRescan) {
        scanAll();
      } else if (pendingCards.size > 0) {
        pendingCards.forEach(card => upsertCard(card));
        removeStalePortals();
      }
      pendingCards.clear();
      needsFullRescan = false;
      syncResizeObserver();
    };

    const scheduleFlush = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        flushMutations();
      });
    };

    mo = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node instanceof Element && node.matches?.(CARD_SELECTOR)) {
            pendingCards.add(node);
            return;
          }

          enqueueCardForNode(node);

          if (
            !needsFullRescan &&
            (node instanceof Element || node instanceof DocumentFragment) &&
            node.querySelector?.(CARD_SELECTOR)
          ) {
            needsFullRescan = true;
          }
        });

        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          enqueueCardForNode(mutation.target);
        }

        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          if (mutation.target.matches(COVER_SELECTOR) || mutation.target.matches(CARD_SELECTOR)) {
            enqueueCardForNode(mutation.target);
          }
        }

        if (mutation.removedNodes.length > 0) {
          needsFullRescan = true;
        }
      }

      scheduleFlush();
    });

    ro = new ResizeObserver(() => {
      needsFullRescan = true;
      scheduleFlush();
    });

    ensureObserverTarget();
    syncResizeObserver();

    return () => {
      if (mo) {
        mo.disconnect();
      }
      if (ro) {
        if (resizeTarget) {
          ro.unobserve(resizeTarget);
        }
        ro.disconnect();
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [handleOpenModal]);

  return (
    <div ref={hostRef}>
      {Array.from(cardPortals.entries()).map(([container, props]) =>
        createPortal(<CardOverlay {...props} isConfigured={isConfigured} />, container)
      )}

      <React.Suspense fallback={null}>
        {modalState &&
          React.createElement(AddSeriesModal, {
            isOpen: true,
            anilistId: modalState.anilistId,
            title: modalState.title,
            onClose: handleCloseModal,
            // IMPORTANT: pass HTMLElement | null (never undefined)
            portalContainer: (hostRef.current as HTMLElement | null) ?? null,
          })}
      </React.Suspense>
    </div>
  );
};

/* ====================== Content script glue ====================== */

export default defineContentScript({
  matches: ['*://anilist.co/*'],
  excludeMatches: ['*://anilist.co/anime/*'],

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
      const containers = document.querySelectorAll<HTMLElement>(`.${INJECTION_CONTAINER_CLASS}`);
      if (containers.length === 0 && !shadowStyleElement && !globalStyleElement) {
        return;
      }

      containers.forEach(container => {
        container.closest<HTMLAnchorElement>(COVER_SELECTOR)?.removeAttribute(PROCESSED_ATTRIBUTE);
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
    };

    const remove = async () => {
      if (!ui) {
        if (
          document.querySelector(`.${INJECTION_CONTAINER_CLASS}`) ||
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

    // Initial route check
    handleLocationChange(location.href);

    // Strongly typed custom event for WXT SPA navigations
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

