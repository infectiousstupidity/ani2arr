/** Typed cache for normalized Anibridge provider mapping payloads. */
// src/mapping/upstream/anibridge-mapping.cache.ts

import { createTtlCache } from '@/shared/cache/ttl-cache';
import type { AnibridgeProviderMappingPayload } from './anibridge-mapping.store';

export const ANIBRIDGE_MAPPING_CACHE_TTL = {
  staleMs: 24 * 60 * 60 * 1000,
  hardMs: 7 * 24 * 60 * 60 * 1000,
} as const;

const ANIBRIDGE_MAPPING_CACHE_NAMESPACE = 'mapping:upstream:providers';

export const anibridgeMappingCache = createTtlCache<AnibridgeProviderMappingPayload>(
  ANIBRIDGE_MAPPING_CACHE_NAMESPACE,
);
