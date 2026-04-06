/** Operational mapping-failure cache used for transient provider and transport errors. */
// src/mapping/cache/extension-mapping.cache.ts

import { createTtlCache, type CacheHit, type CacheWriteOptions } from '@/storage/ttl-cache';
import { CACHE_NAMESPACES } from '@/storage/keys';
import type { ExtensionError } from '@/shared/errors';
import type { Provider } from '@/providers';

const extensionMappingFailureCaches = {
  sonarr: createTtlCache<ExtensionError>(CACHE_NAMESPACES.extensionMappingFailureSonarr),
  radarr: createTtlCache<ExtensionError>(CACHE_NAMESPACES.extensionMappingFailureRadarr),
} as const;

const getExtensionMappingFailureCache = (provider: Provider) =>
  provider === 'radarr' ? extensionMappingFailureCaches.radarr : extensionMappingFailureCaches.sonarr;

const createExtensionMappingCacheKey = (anilistId: number): string => `anilist:${anilistId}`;

export async function readExtensionMappingFailure(
  provider: Provider,
  anilistId: number,
): Promise<CacheHit<ExtensionError> | null> {
  return getExtensionMappingFailureCache(provider).read(createExtensionMappingCacheKey(anilistId));
}

export async function writeExtensionMappingFailure(
  provider: Provider,
  anilistId: number,
  error: ExtensionError,
  cacheOptions: CacheWriteOptions,
): Promise<void> {
  await getExtensionMappingFailureCache(provider).write(
    createExtensionMappingCacheKey(anilistId),
    error,
    cacheOptions,
  );
}

export async function removeExtensionMappingFailure(
  provider: Provider,
  anilistId: number,
): Promise<void> {
  await getExtensionMappingFailureCache(provider).remove(createExtensionMappingCacheKey(anilistId));
}

export async function clearExtensionMappingFailures(provider?: Provider): Promise<void> {
  if (provider) {
    await getExtensionMappingFailureCache(provider).clear();
    return;
  }

  await Promise.all([
    extensionMappingFailureCaches.sonarr.clear(),
    extensionMappingFailureCaches.radarr.clear(),
  ]);
}
