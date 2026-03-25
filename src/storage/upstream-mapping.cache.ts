/** Typed cache for upstream mapping payloads fetched from external mapping sources. */
// src/lib/storage/upstream-mapping.cache.ts

import { createTtlCache } from './ttl-cache';
import { CACHE_NAMESPACES } from './keys';
import type { UpstreamMappingPayload } from '@/services/mapping/upstream';

export const upstreamMappingCaches = {
  primary: createTtlCache<UpstreamMappingPayload>(CACHE_NAMESPACES.upstreamMappingPrimary),
  fallback: createTtlCache<UpstreamMappingPayload>(CACHE_NAMESPACES.upstreamMappingFallback),
} as const;

export type UpstreamMappingCaches = typeof upstreamMappingCaches;
