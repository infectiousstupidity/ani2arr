/** Typed cache for AniList media payloads keyed by AniList ID. */
// src/anilist/media.cache.ts

import { createTtlCache } from '@/shared/cache/ttl-cache';
import type { AniListMedia } from '@/anilist/schemas/media.schema';

export const ANILIST_MEDIA_CACHE_TTL = {
  staleMs: 14 * 24 * 60 * 60 * 1000,
  hardMs: 60 * 24 * 60 * 60 * 1000,
} as const;

const ANILIST_MEDIA_CACHE_NAMESPACE = 'anilist:media';

export const anilistMediaCache = createTtlCache<AniListMedia>(ANILIST_MEDIA_CACHE_NAMESPACE);
