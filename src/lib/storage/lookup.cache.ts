// src/lib/storage/lookup.cache.ts
import { createTtlCache } from './ttl-cache';
import { CACHE_NAMESPACES } from './keys';
import type { RadarrLookupMovie, SonarrLookupSeries } from '@/shared/types';

export const sonarrLookupCaches = {
  positive: createTtlCache<SonarrLookupSeries[]>(CACHE_NAMESPACES.mappingLookupPositiveSonarr),
  negative: createTtlCache<boolean>(CACHE_NAMESPACES.mappingLookupNegativeSonarr),
} as const;

export const radarrLookupCaches = {
  positive: createTtlCache<RadarrLookupMovie[]>(CACHE_NAMESPACES.mappingLookupPositiveRadarr),
  negative: createTtlCache<boolean>(CACHE_NAMESPACES.mappingLookupNegativeRadarr),
} as const;
