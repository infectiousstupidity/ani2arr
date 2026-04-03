/** Media-overlay portal discovery and lifecycle management for parsed browse cards. */
// src/features/media-overlay/hooks/use-media-portals.ts

import { useCallback, useEffect, useState } from 'react';
import type { ParsedCard } from '@/features/media-overlay/types';
import { metadataEqual } from '@/shared/anilist/media-metadata';

const toElementArray = (value: Iterable<Element> | Element | null | undefined): Element[] => {
  if (!value) return [];
  if (value instanceof Element) return [value];
  try {
    return [...value].filter((el): el is Element => el instanceof Element);
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

    for (const card of cards) upsertCard(card);
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
    const fullScanTimerRef = { current: null as ReturnType<typeof globalThis.setTimeout> | null };
    const stalePortalsTimerRef = { current: null as ReturnType<typeof globalThis.setTimeout> | null };
    const FULL_SCAN_WAIT = 150; // ms
    const STALE_PORTALS_WAIT = 100; // ms
    
    const scheduleFullScan = () => {
      if (fullScanTimerRef.current !== null) {
        globalThis.clearTimeout(fullScanTimerRef.current);
      }
      fullScanTimerRef.current = globalThis.setTimeout(() => {
        fullScanTimerRef.current = null;
        scanAll();
      }, FULL_SCAN_WAIT);
    };

    const scheduleStalePortalsCleanup = () => {
      if (stalePortalsTimerRef.current !== null) {
        globalThis.clearTimeout(stalePortalsTimerRef.current);
      }
      stalePortalsTimerRef.current = globalThis.setTimeout(() => {
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
        for (const node of mutation.addedNodes) {
          if (node instanceof Element && node.matches(cardSelector)) {
            cardsToUpsert.add(node);
            continue;
          }

          enqueueCardForNode(node);

          if (!shouldRescan && (node instanceof Element || node instanceof DocumentFragment) && node.querySelector?.(cardSelector)) {
              shouldRescan = true;
            }
        }

        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          enqueueCardForNode(mutation.target);
        }

        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          enqueueCardForNode(mutation.target);
        }

        if (mutation.removedNodes.length > 0) {
          for (const node of mutation.removedNodes) {
            if (node instanceof Element) {
              if (node.matches(cardSelector)) {
                onCardInvalid?.(node);
              }
              for (const container of node.querySelectorAll(containerSelector)) {
                removePortalForContainer(container, false);
              }
            }
          }
          scheduleStalePortalsCleanup();
        }
      }

      for (const card of cardsToUpsert) upsertCard(card);

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
        globalThis.clearTimeout(fullScanTimerRef.current);
        fullScanTimerRef.current = null;
      }
      if (stalePortalsTimerRef.current !== null) {
        globalThis.clearTimeout(stalePortalsTimerRef.current);
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
