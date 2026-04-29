/** Typed cache for provider lookup results, including positive and negative lookup entries. */
// src/mapping/lookup/lookup.cache.ts

import { createTtlCache } from '@/shared/cache/ttl-cache';
import type { RadarrLookupMovie, SonarrLookupSeries } from '@/providers';

export const LOOKUP_CACHE_TTL = {
  positive: {
    staleMs: 10 * 60 * 1000,
    hardMs: 30 * 60 * 60 * 1000,
  },
  negative: {
    staleMs: 24 * 60 * 60 * 1000,
    hardMs: 48 * 60 * 60 * 1000,
  },
} as const;

const LOOKUP_CACHE_IDS = {
  positiveSonarr: 'mapping:lookup:sonarr',
  negativeSonarr: 'mapping:lookup-negative:sonarr',
  positiveRadarr: 'mapping:lookup:radarr',
  negativeRadarr: 'mapping:lookup-negative:radarr',
} as const;

export const sonarrLookupCaches = {
  positive: createTtlCache<SonarrLookupSeries[]>(LOOKUP_CACHE_IDS.positiveSonarr),
  negative: createTtlCache<boolean>(LOOKUP_CACHE_IDS.negativeSonarr),
} as const;

export const radarrLookupCaches = {
  positive: createTtlCache<RadarrLookupMovie[]>(LOOKUP_CACHE_IDS.positiveRadarr),
  negative: createTtlCache<boolean>(LOOKUP_CACHE_IDS.negativeRadarr),
} as const;
