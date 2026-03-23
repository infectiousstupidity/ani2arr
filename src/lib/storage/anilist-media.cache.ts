// src/lib/storage/anilist-media.cache.ts
import { createTtlCache } from './ttl-cache';
import { CACHE_NAMESPACES } from './keys';
import type { AniMedia } from '@/shared/types';

export const anilistMediaCache = createTtlCache<AniMedia>(CACHE_NAMESPACES.anilistMedia);
