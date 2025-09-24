// src/entrypoints/anilist-browse.content/index.tsx
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAddSeries, useExtensionOptions, useSeriesStatus } from '@/hooks/use-api-queries';
import { useTheme } from '@/hooks/use-theme';
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

const AddSeriesModal = React.lazy(() => import('@/ui/AddSeriesModal'));

type ModalState = { anilistId: number; title: string };

/* ====================== Card overlay ====================== */

type OverlayState = 'disabled' | 'in-sonarr' | 'addable' | 'resolving' | 'adding' | 'error';

interface CardOverlayProps {
  anilistId: number;
  title: string;
  onOpenModal: (anilistId: number, title: string) => void;
}

const CardOverlay: React.FC<CardOverlayProps> = memo(({ anilistId, title, onOpenModal }) => {
  const { data: options } = useExtensionOptions();
  const statusQuery = useSeriesStatus({ anilistId, title }, { enabled: Number.isFinite(anilistId) });
  const addSeriesMutation = useAddSeries();

  const isConfigured = !!options?.sonarrUrl && !!options.sonarrApiKey;

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

  const errorMessage = (() => {
    if (addError instanceof Error) return addError.message;
    if (statusError instanceof Error) return statusError.message;
    if (typeof statusError === 'string') return statusError;
    return null;
  })();

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
          void refetch({ throwOnError: false }).catch(() => {});
          return;
        }
      }

      mutate({ anilistId, title });
    },
    [
      addHasError,
      anilistId,
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
        return <span className="kitsunarr-corner-action__spinner" aria-hidden="true" />;
      case 'in-sonarr':
        return (
          <span
            className="kitsunarr-corner-action__symbol kitsunarr-corner-action__symbol--check"
            aria-hidden="true"
          >
            ✓
          </span>
        );
      case 'error':
        return (
          <span className="kitsunarr-corner-action__symbol" aria-hidden="true">
            !
          </span>
        );
      default:
        return (
          <span className="kitsunarr-corner-action__symbol" aria-hidden="true">
            +
          </span>
        );
    }
  })();

  const showAdvancedButton = overlayState !== 'in-sonarr';
  const advancedDisabled = overlayState === 'resolving' || overlayState === 'adding';

  return (
    <div className="kitsunarr-card-overlay" data-state={overlayState}>
      {showAdvancedButton && (
        <div className="kitsunarr-card-overlay__actions" data-state={overlayState}>
          <div className="kitsunarr-card-overlay__action-wrapper">
            <button
              type="button"
              className="kitsunarr-card-overlay__gear"
              aria-label="Open advanced Sonarr options"
              title="Advanced Sonarr options"
              onClick={handleOpenAdvanced}
              onMouseDown={swallowEvent}
              disabled={advancedDisabled}
              aria-disabled={advancedDisabled || undefined}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path
                  d="M7.07095 0.650238C6.67391 0.650238 6.32977 0.925096 6.24198 1.31231L6.0039 2.36247C5.6249 2.47269 5.26335 2.62363 4.92436 2.81013L4.01335 2.23585C3.67748 2.02413 3.23978 2.07312 2.95903 2.35386L2.35294 2.95996C2.0722 3.2407 2.0232 3.6784 2.23493 4.01427L2.80942 4.92561C2.62307 5.2645 2.47227 5.62594 2.36216 6.00481L1.31209 6.24287C0.924883 6.33065 0.650024 6.6748 0.650024 7.07183V7.92897C0.650024 8.32601 0.924883 8.67015 1.31209 8.75794L2.36228 8.99603C2.47246 9.375 2.62335 9.73652 2.80979 10.0755L2.2354 10.9867C2.02367 11.3225 2.07267 11.7602 2.35341 12.041L2.95951 12.6471C3.24025 12.9278 3.67795 12.9768 4.01382 12.7651L4.92506 12.1907C5.26384 12.377 5.62516 12.5278 6.0039 12.6379L6.24198 13.6881C6.32977 14.0753 6.67391 14.3502 7.07095 14.3502H7.92809C8.32512 14.3502 8.66927 14.0753 8.75705 13.6881L8.99505 12.6383C9.37411 12.5282 9.73573 12.3773 10.0748 12.1909L10.986 12.7653C11.3218 12.977 11.7595 12.928 12.0403 12.6473L12.6464 12.0412C12.9271 11.7604 12.9761 11.3227 12.7644 10.9869L12.1902 10.076C12.3768 9.73688 12.5278 9.37515 12.638 8.99596L13.6879 8.75794C14.0751 8.67015 14.35 8.32601 14.35 7.92897V7.07183C14.35 6.6748 14.0751 6.33065 13.6879 6.24287L12.6381 6.00488C12.528 5.62578 12.3771 5.26414 12.1906 4.92507L12.7648 4.01407C12.9766 3.6782 12.9276 3.2405 12.6468 2.95975L12.0407 2.35366C11.76 2.07292 11.3223 2.02392 10.9864 2.23565L10.0755 2.80989C9.73622 2.62328 9.37437 2.47229 8.99505 2.36209L8.75705 1.31231C8.66927 0.925096 8.32512 0.650238 7.92809 0.650238H7.07095ZM4.92053 3.81251C5.44724 3.44339 6.05665 3.18424 6.71543 3.06839L7.07095 1.50024H7.92809L8.28355 3.06816C8.94267 3.18387 9.5524 3.44302 10.0794 3.81224L11.4397 2.9547L12.0458 3.56079L11.1882 4.92117C11.5573 5.44798 11.8164 6.0575 11.9321 6.71638L13.5 7.07183V7.92897L11.932 8.28444C11.8162 8.94342 11.557 9.55301 11.1878 10.0798L12.0453 11.4402L11.4392 12.0462L10.0787 11.1886C9.55192 11.5576 8.94241 11.8166 8.28355 11.9323L7.92809 13.5002H7.07095L6.71543 11.932C6.0569 11.8162 5.44772 11.5572 4.92116 11.1883L3.56055 12.046L2.95445 11.4399L3.81213 10.0794C3.4431 9.55266 3.18403 8.94326 3.06825 8.2845L1.50002 7.92897V7.07183L3.06818 6.71632C3.18388 6.05765 3.44283 5.44833 3.81171 4.92165L2.95398 3.561L3.56008 2.95491L4.92053 3.81251ZM9.02496 7.50008C9.02496 8.34226 8.34223 9.02499 7.50005 9.02499C6.65786 9.02499 5.97513 8.34226 5.97513 7.50008C5.97513 6.65789 6.65786 5.97516 7.50005 5.97516C8.34223 5.97516 9.02496 6.65789 9.02496 7.50008ZM9.92496 7.50008C9.92496 8.83932 8.83929 9.92499 7.50005 9.92499C6.1608 9.92499 5.07513 8.83932 5.07513 7.50008C5.07513 6.16084 6.1608 5.07516 7.50005 5.07516C8.83929 5.07516 9.92496 6.16084 9.92496 7.50008Z"
                  fill="currentColor"
                  fillRule="evenodd"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="kitsunarr-corner-action"
        data-state={overlayState}
        aria-label={quickAddAriaLabel}
        title={quickAddTitle}
        onClick={handleQuickAdd}
        onMouseDown={swallowEvent}
        disabled={quickAddDisabled}
        aria-disabled={quickAddDisabled || undefined}
      >
        <span className="kitsunarr-corner-action__icon">{quickAddIcon}</span>
      </button>
    </div>
  );
});
CardOverlay.displayName = 'CardOverlay';

/* ====================== Root app ====================== */

const BrowseContentApp: React.FC = () => {
  const hostRef = useRef<HTMLDivElement>(null);
  useTheme(hostRef);

  const [cardPortals, setCardPortals] = useState<Map<Element, CardOverlayProps>>(new Map());
  const [modalState, setModalState] = useState<ModalState | null>(null);

  const handleOpenModal = useCallback((anilistId: number, title: string) => {
    setModalState({ anilistId, title });
  }, []);

  const handleCloseModal = useCallback(() => setModalState(null), []);

  useEffect(() => {
    const observerRoot = document.body ?? document.documentElement;
    if (!observerRoot) return;

    const getScanRoot = () =>
      document.querySelector<HTMLElement>('.page-content') ?? document.body;

    const parseCard = (card: Element): (CardOverlayProps & { host: HTMLAnchorElement }) | null => {
      const cover = card.querySelector<HTMLAnchorElement>(COVER_SELECTOR);
      if (!cover) return null;

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

    const mo = new MutationObserver(mutations => {
      let shouldRescan = false;
      const cardsToUpsert = new Set<Element>();

      const enqueueCardForNode = (node: Node | null | undefined) => {
        if (!node) return;
        const element = node instanceof Element ? node : node.parentElement;
        const card = element?.closest?.(CARD_SELECTOR);
        if (card) {
          cardsToUpsert.add(card);
        }
      };

      for (const m of mutations) {
        m.addedNodes.forEach(node => {
          if (node instanceof Element && node.matches?.(CARD_SELECTOR)) {
            cardsToUpsert.add(node);
            return;
          }

          enqueueCardForNode(node);

          if (
            !shouldRescan &&
            (node instanceof Element || node instanceof DocumentFragment) &&
            node.querySelector?.(CARD_SELECTOR)
          ) {
            shouldRescan = true;
          }
        });

        if (m.type === 'childList' && m.addedNodes.length > 0) {
          enqueueCardForNode(m.target);
        }

        if (m.type === 'attributes' && m.target instanceof Element) {
          if (m.target.matches(COVER_SELECTOR) || m.target.matches(CARD_SELECTOR)) {
            enqueueCardForNode(m.target);
          }
        }


        if (m.removedNodes.length > 0) {
          removeStalePortals();
        }
      }

      cardsToUpsert.forEach(card => upsertCard(card));

      if (shouldRescan) scanAll();
    });

    mo.observe(observerRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href'],
    });

    const ro = new ResizeObserver(() => removeStalePortals());
    if (document.body) {
      ro.observe(document.body);
    }

    return () => {
      mo.disconnect();
      ro.disconnect();
    };
  }, [handleOpenModal]);

  return (
    <div ref={hostRef}>
      {Array.from(cardPortals.entries()).map(([container, props]) =>
        createPortal(<CardOverlay {...props} />, container)
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

    let ui: ShadowRootContentScriptUi<Root> | null = null;    
    let root: Root | null = null;
    let styleElement: HTMLStyleElement | null = null;

    const ensureStyles = () => {
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.setAttribute(STYLE_DATA_ATTRIBUTE, 'true');
        styleElement.textContent = browseStyles;
      }
      if (styleElement && !document.head.contains(styleElement)) {
        document.head.appendChild(styleElement);
      }
    };

    const cleanupDomArtifacts = () => {
      document.querySelectorAll<HTMLElement>(`.${INJECTION_CONTAINER_CLASS}`).forEach(container => {
        container.closest<HTMLAnchorElement>(COVER_SELECTOR)?.removeAttribute(PROCESSED_ATTRIBUTE);
        container.remove();
      });

      if (styleElement?.parentNode) {
        styleElement.parentNode.removeChild(styleElement);
      }
    };

    const mount = async () => {
      if (ui) return;

      ensureStyles();

      ui = await createShadowRootUi(ctx, {
        name: 'kitsunarr-browse-root',
        position: 'inline',
        anchor: 'body',
        onMount: (container: HTMLElement) => {
          root = createRoot(container);
          root.render(
            <React.StrictMode>
              <QueryClientProvider client={queryClient}>
                <BrowseContentApp />
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
      cleanupDomArtifacts();
      if (!ui) return;
      ui.remove();
      ui = null;
      root = null;
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
      styleElement?.remove();
      void remove();
    });
  },
});
