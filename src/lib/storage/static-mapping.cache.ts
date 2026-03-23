// src/lib/storage/static-mapping.cache.ts
import { createTtlCache } from './ttl-cache';
import { CACHE_NAMESPACES } from './keys';
import type { StaticMappingPayload } from '@/services/mapping';

export const staticMappingCaches = {
  primary: createTtlCache<StaticMappingPayload>(CACHE_NAMESPACES.mappingStaticPrimary),
  fallback: createTtlCache<StaticMappingPayload>(CACHE_NAMESPACES.mappingStaticFallback),
} as const;
