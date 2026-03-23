/** Typed cache for provider lookup results, including positive and negative lookup entries. */
// src/lib/storage/lookup.cache.ts

import { createTtlCache } from './ttl-cache';
import { CACHE_NAMESPACES } from './keys';
import type { RadarrLookupMovie, SonarrLookupSeries } from '@/shared/types';

export const sonarrLookupCaches = {
  positive: createTtlCache<SonarrLookupSeries[]>(CACHE_NAMESPACES.providerLookupPositiveSonarr),
  negative: createTtlCache<boolean>(CACHE_NAMESPACES.providerLookupNegativeSonarr),
} as const;

export const radarrLookupCaches = {
  positive: createTtlCache<RadarrLookupMovie[]>(CACHE_NAMESPACES.providerLookupPositiveRadarr),
  negative: createTtlCache<boolean>(CACHE_NAMESPACES.providerLookupNegativeRadarr),
} as const;
