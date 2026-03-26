/** Typed cache for AniList media payloads keyed by AniList ID. */
// src/lib/storage/anilist-media.cache.ts

import { createTtlCache } from './ttl-cache';
import { CACHE_NAMESPACES } from './keys';
import type { AniListMedia } from '@/shared/types';

export const anilistMediaCache = createTtlCache<AniListMedia>(CACHE_NAMESPACES.anilistMedia);
