/** Persistent caches for provider title lookup results. */
// src/mapping/auto-mapping/lookup/lookup.cache.ts

import { createTtlCache } from "@/shared/cache/ttl-cache";
import type { RadarrLookupMovie, SonarrLookupSeries } from "@/providers";

export const TITLE_LOOKUP_CACHE_TTL = {
	positive: {
		staleMs: 10 * 60 * 1000,
		hardMs: 30 * 60 * 60 * 1000,
	},
	negative: {
		staleMs: 24 * 60 * 60 * 1000,
		hardMs: 48 * 60 * 60 * 1000,
	},
} as const;

const TITLE_LOOKUP_CACHE_IDS = {
	positiveSonarr: "mapping:lookup:sonarr",
	negativeSonarr: "mapping:lookup-negative:sonarr",
	positiveRadarr: "mapping:lookup:radarr",
	negativeRadarr: "mapping:lookup-negative:radarr",
} as const;

export const sonarrTitleLookupCaches = {
	positive: createTtlCache<SonarrLookupSeries[]>(
		TITLE_LOOKUP_CACHE_IDS.positiveSonarr,
	),
	negative: createTtlCache<boolean>(TITLE_LOOKUP_CACHE_IDS.negativeSonarr),
} as const;

export const radarrTitleLookupCaches = {
	positive: createTtlCache<RadarrLookupMovie[]>(
		TITLE_LOOKUP_CACHE_IDS.positiveRadarr,
	),
	negative: createTtlCache<boolean>(TITLE_LOOKUP_CACHE_IDS.negativeRadarr),
} as const;
