import { useEffect, useMemo, useRef } from 'react';
import type { ParsedCard } from '@/shared/types';
import { getAni2arrApi } from '@/rpc';
import { logger } from '@/shared/utils/logger';

interface UseAnilistBatchPrefetchParams {
  cardPortals: Map<Element, ParsedCard>;
  enabled?: boolean;
}

const log = logger.create('AniList Prefetch');

// Hook to prefetch AniList media data in batches based on card visibility
export const useAnilistBatchPrefetch = ({ cardPortals, enabled = true }: UseAnilistBatchPrefetchParams): void => {
  // Enable on AniList browse/search and AniChart season/browse surfaces.
  const surfaceEnabled = typeof window !== 'undefined' && (() => {
    const host = (window.location.hostname || '').toLowerCase();
    const p = window.location.pathname || '';
    // AniList browse/search
    if (host.includes('anilist.co')) {
      return p === '/' || p.startsWith('/home') || p.startsWith('/search');
    }
    // AniChart season/browse pages (loaded only on anichart entrypoint)
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
  const staticallyMappedRef = useRef<Set<number>>(new Set());
  const offscreenQueueRef = useRef<number[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const observedContainersRef = useRef<Set<Element>>(new Set());
  const busyRef = useRef(false);
  const infoBurstCountRef = useRef(0);
  const initLoggedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  // Stable tick function that doesn't depend on cardPortals
  const tickRef = useRef<(() => Promise<void>) | null>(null);

  // Derive container->ID map from cardPortals as a stable memoized value
  const containerIdMap = useMemo(() => {
    const map = new Map<Element, number>();
    for (const [container, parsed] of cardPortals) {
      map.set(container, parsed.anilistId);
    }
    return map;
  }, [cardPortals]);

  // Initialize observer and timer once when enabled
  useEffect(() => {
    if (!isEnabled) return;

    // Emit a one-time init at info level to verify hook activation in Firefox
    if (!initLoggedRef.current) {
      initLoggedRef.current = true;
      try {
        log.info?.(`prefetch:init enabled path=${window.location.pathname}`);
      } catch {
        // ignore
      }
    }

    // Create observer if it doesn't exist
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

    // Define the tick function
    tickRef.current = async () => {
      if (!isEnabled) return;
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
      if (import.meta.env.DEV) {
        const visibleArr = Array.from(visible.values()).slice(0, 60);
        log.debug?.(
          `prefetch:tick choose chunk size=${chunk.length} visible_size=${visibleArr.length} offscreen_backlog=${offscreen.length} chunk_ids=[${chunk.join(',')}]`,
        );
        // Surface the first few ticks at info-level to make discovery easier
        if (infoBurstCountRef.current < 3) {
          infoBurstCountRef.current += 1;
          log.info?.(
            `prefetch:tick size=${chunk.length} visible_size=${visibleArr.length} offscreen_backlog=${offscreen.length}`,
          );
        }
      }
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

    // Start the interval timer
    const TICK_MS = 300;
    if (timerRef.current === null) {
      timerRef.current = window.setInterval(() => {
        tickRef.current?.();
      }, TICK_MS);
    }

    // Capture refs for cleanup
    const observedContainers = observedContainersRef.current;

    // Cleanup only on disable or unmount
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
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
      offscreenQueueRef.current = [];
      tickRef.current = null;
    };
  }, [isEnabled, api]);

  // Incremental observer updates: only observe added containers, unobserve removed ones
  useEffect(() => {
    if (!isEnabled) return;

    const observer = observerRef.current;
    if (!observer) return;

    const idByContainer = idByContainerRef.current;
    const observedContainers = observedContainersRef.current;
    const currentContainers = new Set(containerIdMap.keys());

    // Find removed containers and unobserve them
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

    // Find added containers and observe them
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
