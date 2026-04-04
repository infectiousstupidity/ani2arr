/** Content-owned AniList browse metadata prefetch scheduling for visible cards. */
// src/content/browse/use-anilist-batch-prefetch.ts

import { useEffect, useMemo, useRef } from 'react';
import { getAni2arrApi } from '@/rpc';
import { logger } from '@/shared/utils/logger';
import type { ParsedCard } from './types';

interface UseAnilistBatchPrefetchParams {
  cardPortals: Map<Element, ParsedCard>;
  enabled?: boolean;
}

const log = logger.create('AniList Prefetch');

export const useAnilistBatchPrefetch = ({ cardPortals, enabled = true }: UseAnilistBatchPrefetchParams): void => {
  const surfaceEnabled = globalThis.window !== undefined && (() => {
    const host = (globalThis.location.hostname || '').toLowerCase();
    const p = globalThis.location.pathname || '';
    if (host.includes('anilist.co')) {
      return p === '/' || p.startsWith('/home') || p.startsWith('/search');
    }
    if (host.includes('anichart.net')) {
      return true;
    }
    return false;
  })();
  const isEnabled = enabled && surfaceEnabled;
  const api = useMemo(() => getAni2arrApi(), []);

  const idByContainerRef = useRef<WeakMap<Element, number>>(new WeakMap());
  const visibleIdsRef = useRef<Set<number>>(new Set());
  const prefetchedIdsRef = useRef<Set<number>>(new Set());
  const queuedIdsRef = useRef<Set<number>>(new Set());
  const staticallyMappedRef = useRef<Set<number>>(new Set());
  const offscreenQueueRef = useRef<number[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const observedContainersRef = useRef<Set<Element>>(new Set());
  const infoBurstCountRef = useRef(0);
  const initLoggedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const tickRef = useRef<(() => Promise<void>) | null>(null);

  const containerIdMap = useMemo(() => {
    const map = new Map<Element, number>();
    for (const [container, parsed] of cardPortals) {
      map.set(container, parsed.anilistId);
    }
    return map;
  }, [cardPortals]);

  useEffect(() => {
    if (!isEnabled) return;

    if (!initLoggedRef.current) {
      initLoggedRef.current = true;
      try {
        log.info?.(`prefetch:init enabled path=${globalThis.location.pathname}`);
      } catch {
        // ignore
      }
    }

    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        entries => {
          const visibleIds = visibleIdsRef.current;
          const idByContainer = idByContainerRef.current;
          const offscreenQueue = offscreenQueueRef.current;
          for (const entry of entries) {
            const id = idByContainer.get(entry.target);
            if (!id) continue;
            if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
              visibleIds.add(id);
              const idx = offscreenQueue.indexOf(id);
              if (idx !== -1) offscreenQueue.splice(idx, 1);
            } else {
              visibleIds.delete(id);
              if (!offscreenQueue.includes(id)) {
                offscreenQueue.push(id);
                if (offscreenQueue.length > 500) {
                  offscreenQueue.splice(0, offscreenQueue.length - 500);
                }
              }
            }
          }
        },
        { root: null, threshold: 0.25 },
      );
    }

    tickRef.current = async () => {
      if (!isEnabled) return;

      const prefetched = prefetchedIdsRef.current;
      const queued = queuedIdsRef.current;
      const visible = visibleIdsRef.current;
      const offscreen = offscreenQueueRef.current;
      const staticallyMapped = staticallyMappedRef.current;

      const visibleCandidates: number[] = [];
      for (const id of visible) {
        if (!prefetched.has(id) && !queued.has(id)) visibleCandidates.push(id);
        if (visibleCandidates.length >= 60) break;
      }

      let toFetch: number[] = [];
      if (visibleCandidates.length > 0) {
        toFetch = visibleCandidates;
      } else {
        for (const id of offscreen) {
          if (!prefetched.has(id) && !queued.has(id)) toFetch.push(id);
          if (toFetch.length >= 60) break;
        }
      }

      if (toFetch.length === 0) return;

      try {
        const unknown = toFetch.filter(id => !staticallyMapped.has(id));
        if (unknown.length > 0) {
          const mapped = await api.getStaticMapped(unknown);
          for (const id of mapped) staticallyMapped.add(id);
        }
      } catch {
        // ignore mapping presence failures; proceed with best-effort prefetch
      }

      toFetch = toFetch.filter(id => !staticallyMapped.has(id));
      if (toFetch.length === 0) return;

      const chunk = toFetch.slice(0, 50);
      if (import.meta.env.DEV) {
        const visibleArr = [...visible.values()].slice(0, 60);
        log.debug?.(
          `prefetch:tick choose chunk size=${chunk.length} visible_size=${visibleArr.length} offscreen_backlog=${offscreen.length} chunk_ids=[${chunk.join(',')}]`,
        );
        if (infoBurstCountRef.current < 3) {
          infoBurstCountRef.current += 1;
          log.info?.(
            `prefetch:tick size=${chunk.length} visible_size=${visibleArr.length} offscreen_backlog=${offscreen.length}`,
          );
        }
      }

      for (const id of chunk) {
        queued.add(id);
      }

      try {
        const entries = await api.prefetchAniListMedia(chunk);
        for (const id of chunk) {
          queued.delete(id);
          prefetched.add(id);
        }
        if (entries.length > 0) {
          log.debug?.(`Prefetched AniList media: +${entries.length} (requested ${chunk.length})`);
        }
      } catch (error) {
        for (const id of chunk) {
          queued.delete(id);
        }
        log.warn('Prefetch batch failed', error);
      }
    };

    const TICK_MS = 300;
    if (timerRef.current === null) {
      timerRef.current = globalThis.setInterval(() => {
        tickRef.current?.();
      }, TICK_MS);
    }

    const observedContainers = observedContainersRef.current;

    return () => {
      if (timerRef.current !== null) {
        globalThis.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      try {
        observerRef.current?.disconnect();
      } catch {
        // ignore
      }
      observerRef.current = null;
      observedContainers.clear();
      observedContainersRef.current = new Set();
      visibleIdsRef.current = new Set();
      queuedIdsRef.current = new Set();
      offscreenQueueRef.current = [];
      tickRef.current = null;
    };
  }, [isEnabled, api]);

  useEffect(() => {
    if (!isEnabled) return;

    const observer = observerRef.current;
    if (!observer) return;

    const idByContainer = idByContainerRef.current;
    const observedContainers = observedContainersRef.current;
    const currentContainers = new Set(containerIdMap.keys());

    for (const container of observedContainers) {
      if (!currentContainers.has(container)) {
        try {
          observer.unobserve(container);
        } catch {
          // ignore
        }
        observedContainers.delete(container);
      }
    }

    for (const container of currentContainers) {
      if (!observedContainers.has(container)) {
        const id = containerIdMap.get(container);
        if (!id) continue;
        idByContainer.set(container, id);
        try {
          observer.observe(container);
        } catch {
          // ignore
        }
        observedContainers.add(container);
      }
    }
  }, [isEnabled, containerIdMap]);
};

export default useAnilistBatchPrefetch;
