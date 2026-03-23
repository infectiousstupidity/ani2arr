/** Typed cache for extension-derived mapping results that are persisted as replaceable cache, not canonical truth. */
// src/lib/storage/extension-mapping.cache.ts

import { createTtlCache, type CacheHit } from './ttl-cache';
import { CACHE_NAMESPACES } from './keys';
import { STORAGE_POLICIES } from './policies';
import type { MappingExternalId, MappingProvider } from '@/shared/types';

export interface ExtensionMappingCacheEntry {
  externalId: MappingExternalId;
  successfulSynonym?: string;
  updatedAt: number;
}

const extensionMappingCaches = {
  sonarr: createTtlCache<ExtensionMappingCacheEntry>(CACHE_NAMESPACES.extensionMappingSonarr),
  radarr: createTtlCache<ExtensionMappingCacheEntry>(CACHE_NAMESPACES.extensionMappingRadarr),
} as const;

const getExtensionMappingCache = (provider: MappingProvider) =>
  provider === 'radarr' ? extensionMappingCaches.radarr : extensionMappingCaches.sonarr;

const createExtensionMappingCacheKey = (anilistId: number): string => `anilist:${anilistId}`;

export async function readExtensionMapping(
  provider: MappingProvider,
  anilistId: number,
): Promise<CacheHit<ExtensionMappingCacheEntry> | null> {
  return getExtensionMappingCache(provider).read(createExtensionMappingCacheKey(anilistId));
}

export async function writeExtensionMapping(
  provider: MappingProvider,
  anilistId: number,
  entry: Omit<ExtensionMappingCacheEntry, 'updatedAt'>,
): Promise<void> {
  await getExtensionMappingCache(provider).write(
    createExtensionMappingCacheKey(anilistId),
    {
      ...entry,
      updatedAt: Date.now(),
    },
    {
      staleMs: STORAGE_POLICIES.extensionMapping.staleMs,
      hardMs: STORAGE_POLICIES.extensionMapping.hardMs,
    },
  );
}

export async function removeExtensionMapping(
  provider: MappingProvider,
  anilistId: number,
): Promise<void> {
  await getExtensionMappingCache(provider).remove(createExtensionMappingCacheKey(anilistId));
}

export async function clearExtensionMappings(provider?: MappingProvider): Promise<void> {
  if (provider) {
    await getExtensionMappingCache(provider).clear();
    return;
  }

  await Promise.all([
    extensionMappingCaches.sonarr.clear(),
    extensionMappingCaches.radarr.clear(),
  ]);
}
