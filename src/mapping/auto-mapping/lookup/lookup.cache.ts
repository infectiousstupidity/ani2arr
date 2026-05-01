/** Persistent caches for provider title lookup results. */
// src/mapping/auto-mapping/lookup/lookup.cache.ts

import { createTtlCache } from "@/shared/cache/ttl-cache";
import type { RadarrLookupMovie, SonarrLookupSeries } from "@/providers";

export const TITLE_LOOKUP_CACHE_TTL = {
	results: {
		staleMs: 10 * 60 * 1000,
		hardMs: 30 * 60 * 60 * 1000,
	},
	emptyResults: {
		staleMs: 24 * 60 * 60 * 1000,
		hardMs: 48 * 60 * 60 * 1000,
	},
} as const;

const TITLE_LOOKUP_CACHE_IDS = {
	sonarr: "mapping:lookup:sonarr",
	radarr: "mapping:lookup:radarr",
} as const;

export const sonarrTitleLookupCache = createTtlCache<SonarrLookupSeries[]>(
	TITLE_LOOKUP_CACHE_IDS.sonarr,
);

export const radarrTitleLookupCache = createTtlCache<RadarrLookupMovie[]>(
	TITLE_LOOKUP_CACHE_IDS.radarr,
);
