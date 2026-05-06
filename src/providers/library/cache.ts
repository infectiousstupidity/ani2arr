/** LEGACY: Radarr library cache logic retained until Radarr moves into src/providers/radarr. */
// src/providers/library/cache.ts

import { createTtlCache } from "@/shared/cache/ttl-cache";
import type { RadarrMovieSnapshot } from "@/providers";

export const PROVIDER_LIBRARY_CACHE_TTL = {
	normal: {
		staleMs: 60 * 60 * 1000,
		hardMs: 24 * 60 * 60 * 1000,
	},
	error: {
		staleMs: 5 * 60 * 1000,
		hardMs: 10 * 60 * 1000,
	},
} as const;

const PROVIDER_LIBRARY_CACHE_IDS = {
	radarrLean: "library:lean:radarr",
} as const;

export const providerLibraryCaches = {
	radarr: {
		lean: createTtlCache<RadarrMovieSnapshot[]>(
			PROVIDER_LIBRARY_CACHE_IDS.radarrLean,
		),
	},
} as const;
