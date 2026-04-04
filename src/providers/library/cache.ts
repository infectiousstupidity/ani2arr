/** Typed cache for lean Sonarr and Radarr library snapshots used for status checks and enrichment. */
// src/providers/library/cache.ts

import { CACHE_NAMESPACES } from '@/storage/keys';
import { createTtlCache } from '@/storage/ttl-cache';
import type { SonarrSeriesSnapshot, RadarrMovieSnapshot } from '@/providers';

export const providerLibraryCaches = {
  sonarr: {
    lean: createTtlCache<SonarrSeriesSnapshot[]>(CACHE_NAMESPACES.libraryLeanSonarr),
  },
  radarr: {
    lean: createTtlCache<RadarrMovieSnapshot[]>(CACHE_NAMESPACES.libraryLeanRadarr),
  },
} as const;
