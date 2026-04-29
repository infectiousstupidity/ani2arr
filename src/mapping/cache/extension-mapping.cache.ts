/** Operational mapping-failure cache used for transient provider and transport errors. */
// src/mapping/cache/extension-mapping.cache.ts

import { createTtlCache, type CacheHit } from '@/shared/cache/ttl-cache';
import type { AniListId } from '@/anilist';
import { ErrorCode, type ExtensionError } from '@/shared/errors';
import type { Provider } from '@/providers';

export const EXTENSION_MAPPING_FAILURE_TTL = {
  default: {
    staleMs: 30 * 60 * 1000,
    hardMs: 60 * 60 * 1000,
  },
  network: {
    staleMs: 5 * 60 * 1000,
    hardMs: 15 * 60 * 1000,
  },
} as const;

const EXTENSION_MAPPING_FAILURE_NAMESPACES = {
  sonarr: 'mapping:extension-failure:sonarr',
  radarr: 'mapping:extension-failure:radarr',
} as const;

const extensionMappingFailureCaches = {
  sonarr: createTtlCache<ExtensionError>(EXTENSION_MAPPING_FAILURE_NAMESPACES.sonarr),
  radarr: createTtlCache<ExtensionError>(EXTENSION_MAPPING_FAILURE_NAMESPACES.radarr),
} as const;

const getExtensionMappingFailureCache = (provider: Provider) =>
  provider === 'radarr' ? extensionMappingFailureCaches.radarr : extensionMappingFailureCaches.sonarr;

const createExtensionMappingCacheKey = (anilistId: AniListId): string => `anilist:${anilistId}`;

const failureTtlFor = (error: ExtensionError): typeof EXTENSION_MAPPING_FAILURE_TTL.default => {
  if (error.code === ErrorCode.NETWORK_ERROR || error.code === ErrorCode.API_ERROR) {
    return EXTENSION_MAPPING_FAILURE_TTL.network;
  }

  return EXTENSION_MAPPING_FAILURE_TTL.default;
};

export async function readExtensionMappingFailure(
  provider: Provider,
  anilistId: AniListId,
): Promise<CacheHit<ExtensionError> | null> {
  return getExtensionMappingFailureCache(provider).read(createExtensionMappingCacheKey(anilistId));
}

export async function writeExtensionMappingFailure(
  provider: Provider,
  anilistId: AniListId,
  error: ExtensionError,
): Promise<void> {
  const ttl = failureTtlFor(error);
  await getExtensionMappingFailureCache(provider).write(
    createExtensionMappingCacheKey(anilistId),
    error,
    ttl,
  );
}

export async function removeExtensionMappingFailure(
  provider: Provider,
  anilistId: AniListId,
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
