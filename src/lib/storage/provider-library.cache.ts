/** Typed cache for lean Sonarr and Radarr library snapshots used for status checks and enrichment. */
// src/lib/storage/provider-library.cache.ts

import { createTtlCache } from './ttl-cache';
import { CACHE_NAMESPACES } from './keys';
import type { LeanRadarrMovie, LeanSonarrSeries } from '@/shared/types';

export const providerLibraryCaches = {
  sonarr: {
    lean: createTtlCache<LeanSonarrSeries[]>(CACHE_NAMESPACES.libraryLeanSonarr),
  },
  radarr: {
    lean: createTtlCache<LeanRadarrMovie[]>(CACHE_NAMESPACES.libraryLeanRadarr),
  },
} as const;
