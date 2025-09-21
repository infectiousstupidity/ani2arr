// src/entrypoints/anilist-browse.content/index.tsx
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSeriesStatus } from '@/hooks/use-api-queries';
import { useTheme } from '@/hooks/use-theme';
import './style.css';

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
const INJECTION_CONTAINER_CLASS = 'kitsunarr-overlay-container';

const AddSeriesModal = React.lazy(() => import('@/ui/AddSeriesModal'));

type ModalState = { anilistId: number; title: string };

/* ====================== Card overlay ====================== */

interface CardOverlayProps {
  anilistId: number;
  title: string;
  onOpenModal: (anilistId: number, title: string) => void;
}

const CardOverlay: React.FC<CardOverlayProps> = memo(({ anilistId, title, onOpenModal }) => {
  const { data, isLoading } = useSeriesStatus({ anilistId });

  if (isLoading) return null;

  if (data?.exists) {
    return <div className="kitsunarr-in-sonarr-indicator" title="In Sonarr" />;
  }

  const handleAddClick: React.MouseEventHandler<HTMLButtonElement> = e => {
    e.preventDefault();
    e.stopPropagation();
    onOpenModal(anilistId, title);
  };

  return (
    <button className="kitsunarr-add-btn" title="Add to Sonarr" onClick={handleAddClick}>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14" /><path d="M12 5v14" />
      </svg>
    </button>
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

  const processed = useMemo(() => new WeakSet<Element>(), []);

  useEffect(() => {
    const rootContainer = document.querySelector('.page-content') || document.body;

    const parseCard = (card: Element): CardOverlayProps | null => {
      const title =
        (card.querySelector<HTMLDivElement>('.title a')?.textContent ?? '').trim() ||
        (card.querySelector<HTMLDivElement>('.title')?.textContent ?? '').trim();

      const href =
        card.querySelector<HTMLAnchorElement>('a.cover')?.href ||
        card.querySelector<HTMLAnchorElement>('a')?.href ||
        '';
      const idMatch = href.match(/\/anime\/(\d+)/);
      const anilistId = idMatch ? Number(idMatch[1]) : NaN;

      if (!title || !Number.isFinite(anilistId)) return null;
      return { anilistId, title, onOpenModal: handleOpenModal };
    };

    const ensureContainer = (card: Element): HTMLElement | null => {
      const existing = card.querySelector<HTMLElement>(`.${INJECTION_CONTAINER_CLASS}`);
      if (existing) return existing;
      const el = document.createElement('div');
      el.className = INJECTION_CONTAINER_CLASS;
      card.appendChild(el);
      return el;
    };

    const addCard = (card: Element) => {
      if (processed.has(card)) return;
      const props = parseCard(card);
      if (!props) return;
      const container = ensureContainer(card);
      if (!container) return;

      processed.add(card);
      setCardPortals(prev => {
        const next = new Map(prev);
        next.set(container, props);
        return next;
      });
    };

    const removeStalePortals = () => {
      setCardPortals(prev => {
        let changed = false;
        const next = new Map(prev);
        for (const key of prev.keys()) {
          if (!document.contains(key)) {
            next.delete(key);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };

    const scanAll = () => {
      const cards = rootContainer.querySelectorAll(CARD_SELECTOR);
      if (cards.length === 0) return;
      cards.forEach(card => addCard(card));
      removeStalePortals();
    };

    scanAll();

    const mo = new MutationObserver(mutations => {
      let shouldRescan = false;

      for (const m of mutations) {
        m.addedNodes.forEach(node => {
          if (!(node instanceof Element)) return;
          if (node.matches?.(CARD_SELECTOR)) {
            addCard(node);
          } else if (!shouldRescan && node.querySelector?.(CARD_SELECTOR)) {
            shouldRescan = true;
          }
        });

        if (m.removedNodes.length > 0) {
          removeStalePortals();
        }
      }

      if (shouldRescan) scanAll();
    });

    mo.observe(rootContainer, { childList: true, subtree: true });

    const ro = new ResizeObserver(() => removeStalePortals());
    ro.observe(document.body);

    return () => {
      mo.disconnect();
      ro.disconnect();
    };
  }, [handleOpenModal, processed]);

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
  cssInjectionMode: 'ui',

  async main(ctx) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60_000,
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    });

    let ui: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let root: Root | null = null;

    const mount = async () => {
      if (ui) return;

      ui = await createShadowRootUi(ctx, {
        name: 'kitsunarr-browse-root',
        position: 'inline',
        anchor: 'body',
        onMount: container => {
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
      if (!ui) return;
      // WXT: the method is `remove()`, not `unmount()`
      await ui.remove();
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

    ctx.onInvalidated(remove);
  },
});
