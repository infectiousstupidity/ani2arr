/** Typed cache for upstream mapping payloads fetched from external mapping sources. */
// src/lib/storage/upstream-mapping.cache.ts

import { createTtlCache } from './ttl-cache';
import { CACHE_NAMESPACES } from './keys';
import type { upstreamMappingPayload } from '@/services/mapping';

export const upstreamMappingCaches = {
  primary: createTtlCache<upstreamMappingPayload>(CACHE_NAMESPACES.upstreamMappingPrimary),
  fallback: createTtlCache<upstreamMappingPayload>(CACHE_NAMESPACES.upstreamMappingFallback),
} as const;
