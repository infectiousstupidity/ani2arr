/** Typed cache for lean Sonarr and Radarr library snapshots used for status checks and enrichment. */
// src/storage/provider-library.cache.ts

import { createTtlCache } from './ttl-cache';
import { CACHE_NAMESPACES } from './keys';
import type { SonarrSeriesSnapshot, RadarrMovieSnapshot } from '@/integrations/providers';

export const providerLibraryCaches = {
  sonarr: {
    lean: createTtlCache<SonarrSeriesSnapshot[]>(CACHE_NAMESPACES.libraryLeanSonarr),
  },
  radarr: {
    lean: createTtlCache<RadarrMovieSnapshot[]>(CACHE_NAMESPACES.libraryLeanRadarr),
  },
} as const;
