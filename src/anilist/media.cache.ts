/** Typed cache for AniList media payloads keyed by AniList ID. */
// src/anilist/media.cache.ts

import { createTtlCache } from '@/storage/ttl-cache';
import { CACHE_NAMESPACES } from '@/storage/keys';
import type { AniListMedia } from '@/anilist/schemas/media.schema';

export const anilistMediaCache = createTtlCache<AniListMedia>(CACHE_NAMESPACES.anilistMedia);
