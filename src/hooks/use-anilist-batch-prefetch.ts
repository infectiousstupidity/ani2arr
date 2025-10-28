import { useEffect, useMemo, useRef } from 'react';
import type { ParsedCard } from '@/types';
import { getKitsunarrApi } from '@/rpc';
import { logger } from '@/utils/logger';

interface UseAnilistBatchPrefetchParams {
  cardPortals: Map<Element, ParsedCard>;
}

const log = logger.create('AniList Prefetch');

// Hook to prefetch AniList media data in batches based on card visibility
export const useAnilistBatchPrefetch = ({ cardPortals }: UseAnilistBatchPrefetchParams): void => {
  // Only enable on search/browse surfaces where grids are large.
  const enabled = typeof window !== 'undefined' && window.location.pathname.startsWith('/search/anime');
  const api = useMemo(() => getKitsunarrApi(), []);

  const idByContainerRef = useRef<WeakMap<Element, number>>(new WeakMap());
  const visibleIdsRef = useRef<Set<number>>(new Set());
  const prefetchedIdsRef = useRef<Set<number>>(new Set());
  const staticallyMappedRef = useRef<Set<number>>(new Set());
  const offscreenQueueRef = useRef<number[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    // Ensure an observer exists
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
              // Remove from offscreen queue if it becomes visible
              const idx = offscreenQueue.indexOf(id);
              if (idx >= 0) offscreenQueue.splice(idx, 1);
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

    const observer = observerRef.current;

    // Track current containers and observe them
    const currentContainers = Array.from(cardPortals.keys());
    const idByContainer = idByContainerRef.current;

    // Observe new containers and map ids
    for (const container of currentContainers) {
      const parsed = cardPortals.get(container);
      if (!parsed) continue;
      idByContainer.set(container, parsed.anilistId);
      try {
        observer.observe(container);
      } catch {
        // ignore
      }
    }

    // Debounced scheduler loop
    let timer: number | null = null;
    const TICK_MS = 300;

    const tick = async () => {
      if (!enabled) return;
      if (busyRef.current) return;

      const prefetched = prefetchedIdsRef.current;
      const visible = visibleIdsRef.current;
      const offscreen = offscreenQueueRef.current;
      const staticallyMapped = staticallyMappedRef.current;

      // Prioritize visible ids (cap ~60)
      const visibleCandidates: number[] = [];
      for (const id of visible) {
        if (!prefetched.has(id)) visibleCandidates.push(id);
        if (visibleCandidates.length >= 60) break;
      }

      let toFetch: number[] = [];
      if (visibleCandidates.length > 0) {
        toFetch = visibleCandidates;
      } else {
        // Background: offscreen FIFO
        for (const id of offscreen) {
          if (!prefetched.has(id)) toFetch.push(id);
          if (toFetch.length >= 60) break;
        }
      }

      if (toFetch.length === 0) return;

      // Filter out IDs that are already covered by static mappings
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

      // Chunk to 50 per request and process a single chunk per tick
      const chunk = toFetch.slice(0, 50);
      busyRef.current = true;

      try {
        const entries = await api.prefetchAniListMedia(chunk);
        // Mark prefetched for all requested ids regardless of individual results
        for (const id of chunk) {
          prefetched.add(id);
        }
        // Optional: could use returned entries for local UI hydration if needed
        if (entries.length > 0) {
          log.debug?.(`Prefetched AniList media: +${entries.length} (requested ${chunk.length})`);
        }
      } catch (error) {
        // Background handles retry/backoff; on failure, clear busy and try later
        log.warn('Prefetch batch failed', error);
      } finally {
        busyRef.current = false;
      }
    };

    const start = () => {
      if (timer !== null) return;
      timer = window.setInterval(tick, TICK_MS);
    };
    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    start();

    return () => {
      stop();
      try {
        observer.disconnect();
      } catch {
        // ignore
      }
      // Reset state without reading ref values in cleanup
      visibleIdsRef.current = new Set();
      offscreenQueueRef.current = [];
    };
  }, [enabled, api, cardPortals]);
};

export default useAnilistBatchPrefetch;
