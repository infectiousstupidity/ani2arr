import { useCallback, useEffect, useState } from 'react';
import type { ParsedCard } from '@/shared/types';
import { metadataEqual } from '@/shared/anilist/media-metadata';

const toElementArray = (value: Iterable<Element> | Element | null | undefined): Element[] => {
  if (!value) return [];
  if (value instanceof Element) return [value];
  try {
    return Array.from(value).filter((el): el is Element => el instanceof Element);
  } catch {
    return [];
  }
};

export interface UseBrowsePortalsParams {
  cardSelector: string;
  containerSelector: string;
  parseCard(card: Element): ParsedCard | null;
  ensureContainer(host: HTMLElement, card: Element): HTMLElement;
  getContainerForCard(card: Element): HTMLElement | null;
  markProcessed(host: HTMLElement, parsed: ParsedCard): void;
  clearProcessed(host: HTMLElement): void;
  getObserverRoot(): Node | null;
  getScanRoot(): Element | null;
  getResizeTargets(): Iterable<Element> | Element | null;
  mutationObserverInit: MutationObserverInit;
  onCardInvalid?: ((card: Element) => void) | undefined;
  enabled?: boolean;
}

export interface UseBrowsePortalsResult {
  cardPortals: Map<Element, ParsedCard>;
}

export const useBrowsePortals = ({
  cardSelector,
  containerSelector,
  parseCard,
  ensureContainer,
  getContainerForCard,
  markProcessed,
  clearProcessed,
  getObserverRoot,
  getScanRoot,
  getResizeTargets,
  mutationObserverInit,
  onCardInvalid,
  enabled = true,
}: UseBrowsePortalsParams): UseBrowsePortalsResult => {
  const [cardPortals, setCardPortals] = useState<Map<Element, ParsedCard>>(new Map());

  useEffect(() => {
    if (!enabled) {
      setCardPortals(prev => (prev.size > 0 ? new Map() : prev));
    }
  }, [enabled]);

  const removePortalForContainer = useCallback((container: Element, removeDom = false) => {
    setCardPortals(prev => {
      if (!prev.has(container)) return prev;
      const next = new Map(prev);
      const parsed = next.get(container);
      if (parsed) {
        clearProcessed(parsed.host);
      }
      next.delete(container);
      return next;
    });

    if (removeDom && container instanceof HTMLElement && container.isConnected) {
      container.remove();
    }
  }, [clearProcessed]);

  const removeStalePortals = useCallback(() => {
    setCardPortals(prev => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const [container, parsed] of prev.entries()) {
        if (typeof document !== 'undefined' && !document.contains(container)) {
          clearProcessed(parsed.host);
          next.delete(container);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [clearProcessed]);

  const upsertCard = useCallback((card: Element) => {
    const parsed = parseCard(card);
    if (!parsed) {
      onCardInvalid?.(card);
      const fallbackContainer = getContainerForCard(card);
      if (fallbackContainer) {
        removePortalForContainer(fallbackContainer, true);
      }
      return;
    }

    const container = ensureContainer(parsed.host, card);
    markProcessed(parsed.host, parsed);

    setCardPortals(prev => {
      const existing = prev.get(container);
      if (
        existing &&
        existing.anilistId === parsed.anilistId &&
        existing.title === parsed.title &&
        existing.host === parsed.host &&
        metadataEqual(existing.metadata, parsed.metadata)
      ) {
        return prev;
      }
      const next = new Map(prev);
      next.set(container, parsed);
      return next;
    });
  }, [ensureContainer, getContainerForCard, markProcessed, onCardInvalid, parseCard, removePortalForContainer]);

  const scanAll = useCallback(() => {
    if (!enabled) {
      setCardPortals(prev => (prev.size > 0 ? new Map() : prev));
      return;
    }

    const root = getScanRoot();
    if (!root) {
      removeStalePortals();
      return;
    }

    const cards = root.querySelectorAll(cardSelector);
    if (cards.length === 0) {
      removeStalePortals();
      return;
    }

    cards.forEach(card => upsertCard(card));
    removeStalePortals();
  }, [cardSelector, getScanRoot, removeStalePortals, upsertCard, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const observerRoot = getObserverRoot();
    if (!observerRoot) return;

    scanAll();

    // Throttle full scans and stale portal cleanup to avoid repeated expensive operations
    // while still processing direct card additions/removals immediately.
    // Uses simple coalescing debounces local to this effect.
    const fullScanTimerRef = { current: null as number | null };
    const stalePortalsTimerRef = { current: null as number | null };
    const FULL_SCAN_WAIT = 150; // ms
    const STALE_PORTALS_WAIT = 100; // ms
    
    const scheduleFullScan = () => {
      if (fullScanTimerRef.current !== null) {
        window.clearTimeout(fullScanTimerRef.current);
      }
      fullScanTimerRef.current = window.setTimeout(() => {
        fullScanTimerRef.current = null;
        scanAll();
      }, FULL_SCAN_WAIT);
    };

    const scheduleStalePortalsCleanup = () => {
      if (stalePortalsTimerRef.current !== null) {
        window.clearTimeout(stalePortalsTimerRef.current);
      }
      stalePortalsTimerRef.current = window.setTimeout(() => {
        stalePortalsTimerRef.current = null;
        removeStalePortals();
      }, STALE_PORTALS_WAIT);
    };

    const mo = new MutationObserver(mutations => {
      let shouldRescan = false;
      const cardsToUpsert = new Set<Element>();

      const enqueueCardForNode = (node: Node | null | undefined) => {
        if (!node) return;
        const element = node instanceof Element ? node : node.parentElement;
        const card = element?.closest(cardSelector);
        if (card) cardsToUpsert.add(card);
      };

      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node instanceof Element && node.matches(cardSelector)) {
            cardsToUpsert.add(node);
            return;
          }

          enqueueCardForNode(node);

          if (!shouldRescan && (node instanceof Element || node instanceof DocumentFragment)) {
            if (node.querySelector?.(cardSelector)) {
              shouldRescan = true;
            }
          }
        });

        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          enqueueCardForNode(mutation.target);
        }

        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          enqueueCardForNode(mutation.target);
        }

        if (mutation.removedNodes.length > 0) {
          mutation.removedNodes.forEach(node => {
            if (node instanceof Element) {
              if (node.matches(cardSelector)) {
                onCardInvalid?.(node);
              }
              node.querySelectorAll(containerSelector).forEach(container => {
                removePortalForContainer(container, false);
              });
            }
          });
          scheduleStalePortalsCleanup();
        }
      }

      cardsToUpsert.forEach(card => upsertCard(card));

      if (shouldRescan) scheduleFullScan();
    });

    mo.observe(observerRoot, mutationObserverInit);

    const resizeTargets = toElementArray(getResizeTargets());
    let ro: ResizeObserver | null = null;
    if (resizeTargets.length > 0) {
      ro = new ResizeObserver(() => scheduleStalePortalsCleanup());
      for (const target of resizeTargets) {
        try {
          ro.observe(target);
        } catch {
          // Ignore observation errors for nodes that might no longer be connected.
        }
      }
    }

    return () => {
      mo.disconnect();
      if (ro) {
        ro.disconnect();
      }
      if (fullScanTimerRef.current !== null) {
        window.clearTimeout(fullScanTimerRef.current);
        fullScanTimerRef.current = null;
      }
      if (stalePortalsTimerRef.current !== null) {
        window.clearTimeout(stalePortalsTimerRef.current);
        stalePortalsTimerRef.current = null;
      }
    };
  }, [
    cardSelector,
    containerSelector,
    getObserverRoot,
    getResizeTargets,
    mutationObserverInit,
    onCardInvalid,
    removePortalForContainer,
    removeStalePortals,
    scanAll,
    upsertCard,
    enabled,
  ]);

  return { cardPortals };
};
