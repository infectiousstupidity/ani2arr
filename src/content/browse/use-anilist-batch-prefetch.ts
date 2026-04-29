/** Content-owned AniList browse metadata prefetch scheduling for visible cards. */
// src/content/browse/use-anilist-batch-prefetch.ts

import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import type { AniListId } from '@/anilist';
import { getAni2arrApi } from '@/rpc';
import { logger } from '@/shared/utils/logger';
import type { HostMediaTarget } from './types';

interface UseAnilistBatchPrefetchParams {
  cardPortals: Map<Element, HostMediaTarget>;
  enabled?: boolean;
}

const log = logger.create('AniList Prefetch');

function isSupportedPrefetchSurface(): boolean {
  if (globalThis.window === undefined) {
    return false;
  }

  const host = (globalThis.location.hostname || '').toLowerCase();
  const path = globalThis.location.pathname || '';
  if (host.includes('anilist.co')) {
    return path === '/' || path.startsWith('/home') || path.startsWith('/search');
  }

  return host.includes('anichart.net');
}

function collectPrefetchCandidates(input: {
  prefetched: Set<AniListId>;
  queued: Set<AniListId>;
  visible: Set<AniListId>;
  offscreen: AniListId[];
}): AniListId[] {
  const visibleCandidates: AniListId[] = [];
  for (const id of input.visible) {
    if (!input.prefetched.has(id) && !input.queued.has(id)) {
      visibleCandidates.push(id);
    }
    if (visibleCandidates.length >= 60) {
      break;
    }
  }

  if (visibleCandidates.length > 0) {
    return visibleCandidates;
  }

  const offscreenCandidates: AniListId[] = [];
  for (const id of input.offscreen) {
    if (!input.prefetched.has(id) && !input.queued.has(id)) {
      offscreenCandidates.push(id);
    }
    if (offscreenCandidates.length >= 60) {
      break;
    }
  }

  return offscreenCandidates;
}

async function filterKnownMappedIds(input: {
  ids: AniListId[];
  knownMapped: Set<AniListId>;
  api: ReturnType<typeof getAni2arrApi>;
}): Promise<AniListId[]> {
  const unknown = input.ids.filter((id) => !input.knownMapped.has(id));
  if (unknown.length === 0) {
    return input.ids.filter((id) => !input.knownMapped.has(id));
  }

  try {
    const identities = await input.api.getMappingIdentities(unknown);
    for (const identity of identities) {
      if (identity.providerMappingState === 'mapped' && identity.providerId !== null) {
        input.knownMapped.add(identity.anilistId);
      }
    }
  } catch {
    // ignore mapping presence failures; proceed with best-effort prefetch
  }

  return input.ids.filter((id) => !input.knownMapped.has(id));
}

function logPrefetchChunk(input: {
  chunk: AniListId[];
  visible: Set<AniListId>;
  offscreen: AniListId[];
  infoBurstCountRef: MutableRefObject<number>;
}): void {
  if (!import.meta.env.DEV) {
    return;
  }

  const visibleArr = [...input.visible.values()].slice(0, 60);
  log.debug?.(
    `prefetch:tick choose chunk size=${input.chunk.length} visible_size=${visibleArr.length} offscreen_backlog=${input.offscreen.length} chunk_ids=[${input.chunk.join(',')}]`,
  );

  if (input.infoBurstCountRef.current >= 3) {
    return;
  }

  input.infoBurstCountRef.current += 1;
  log.info?.(
    `prefetch:tick size=${input.chunk.length} visible_size=${visibleArr.length} offscreen_backlog=${input.offscreen.length}`,
  );
}

export const useAnilistBatchPrefetch = ({ cardPortals, enabled = true }: UseAnilistBatchPrefetchParams): void => {
  const surfaceEnabled = isSupportedPrefetchSurface();
  const isEnabled = enabled && surfaceEnabled;
  const api = useMemo(() => getAni2arrApi(), []);

  const idByContainerRef = useRef<WeakMap<Element, AniListId>>(new WeakMap());
  const visibleIdsRef = useRef<Set<AniListId>>(new Set());
  const prefetchedIdsRef = useRef<Set<AniListId>>(new Set());
  const queuedIdsRef = useRef<Set<AniListId>>(new Set());
  const knownMappedRef = useRef<Set<AniListId>>(new Set());
  const offscreenQueueRef = useRef<AniListId[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const observedContainersRef = useRef<Set<Element>>(new Set());
  const infoBurstCountRef = useRef(0);
  const initLoggedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const tickRef = useRef<(() => Promise<void>) | null>(null);

  const containerIdMap = useMemo(() => {
    const map = new Map<Element, AniListId>();
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
      const knownMapped = knownMappedRef.current;
      let toFetch = collectPrefetchCandidates({
        prefetched,
        queued,
        visible,
        offscreen,
      });

      if (toFetch.length === 0) return;

      toFetch = await filterKnownMappedIds({
        ids: toFetch,
        knownMapped,
        api,
      });
      if (toFetch.length === 0) return;

      const chunk = toFetch.slice(0, 50);
      logPrefetchChunk({
        chunk,
        visible,
        offscreen,
        infoBurstCountRef,
      });

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
