/** Typed cache for extension-derived mapping results and replaceable mapping failures. */
// src/storage/extension-mapping.cache.ts

import { createTtlCache, type CacheHit, type CacheWriteOptions } from './ttl-cache';
import { CACHE_NAMESPACES } from './keys';
import { STORAGE_POLICIES } from './policies';
import type { ExtensionError } from '@/shared/errors';
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

const extensionMappingFailureCaches = {
  sonarr: createTtlCache<ExtensionError>(CACHE_NAMESPACES.extensionMappingFailureSonarr),
  radarr: createTtlCache<ExtensionError>(CACHE_NAMESPACES.extensionMappingFailureRadarr),
} as const;

const getExtensionMappingCache = (provider: MappingProvider) =>
  provider === 'radarr' ? extensionMappingCaches.radarr : extensionMappingCaches.sonarr;

const getExtensionMappingFailureCache = (provider: MappingProvider) =>
  provider === 'radarr' ? extensionMappingFailureCaches.radarr : extensionMappingFailureCaches.sonarr;

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

export async function readExtensionMappingFailure(
  provider: MappingProvider,
  anilistId: number,
): Promise<CacheHit<ExtensionError> | null> {
  return getExtensionMappingFailureCache(provider).read(createExtensionMappingCacheKey(anilistId));
}

export async function writeExtensionMappingFailure(
  provider: MappingProvider,
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
  provider: MappingProvider,
  anilistId: number,
): Promise<void> {
  await getExtensionMappingFailureCache(provider).remove(createExtensionMappingCacheKey(anilistId));
}

export async function clearExtensionMappingFailures(provider?: MappingProvider): Promise<void> {
  if (provider) {
    await getExtensionMappingFailureCache(provider).clear();
    return;
  }

  await Promise.all([
    extensionMappingFailureCaches.sonarr.clear(),
    extensionMappingFailureCaches.radarr.clear(),
  ]);
}
