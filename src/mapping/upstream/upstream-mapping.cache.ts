/** Typed cache for upstream mapping payloads fetched from external mapping sources. */
// src/mapping/upstream/upstream-mapping.cache.ts

import { createTtlCache } from '@/storage/ttl-cache';
import { CACHE_NAMESPACES } from '@/storage/keys';
import type { UpstreamMappingPayload } from './upstream-mapping.store';

export const upstreamMappingCaches = {
  primary: createTtlCache<UpstreamMappingPayload>(CACHE_NAMESPACES.upstreamMappingPrimary),
  fallback: createTtlCache<UpstreamMappingPayload>(CACHE_NAMESPACES.upstreamMappingFallback),
} as const;
