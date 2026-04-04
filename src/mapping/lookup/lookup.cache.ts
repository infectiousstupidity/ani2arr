/** Typed cache for provider lookup results, including positive and negative lookup entries. */
// src/mapping/lookup/lookup.cache.ts

import { createTtlCache } from '@/storage/ttl-cache';
import { CACHE_NAMESPACES } from '@/storage/keys';
import type { RadarrLookupMovie, SonarrLookupSeries } from '@/providers';

export const sonarrLookupCaches = {
  positive: createTtlCache<SonarrLookupSeries[]>(CACHE_NAMESPACES.providerLookupPositiveSonarr),
  negative: createTtlCache<boolean>(CACHE_NAMESPACES.providerLookupNegativeSonarr),
} as const;

export const radarrLookupCaches = {
  positive: createTtlCache<RadarrLookupMovie[]>(CACHE_NAMESPACES.providerLookupPositiveRadarr),
  negative: createTtlCache<boolean>(CACHE_NAMESPACES.providerLookupNegativeRadarr),
} as const;
