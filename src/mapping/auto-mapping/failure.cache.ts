/** Auto-mapping failure cache used for transient provider and transport errors. */
// src/mapping/auto-mapping/failure.cache.ts

import { createTtlCache, type CacheHit } from '@/shared/cache/ttl-cache';
import type { AniListId } from '@/anilist';
import { ErrorCode, type ExtensionError } from '@/shared/errors';
import type { Provider } from '@/providers';

export const AUTO_MAPPING_FAILURE_TTL = {
  default: {
    staleMs: 30 * 60 * 1000,
    hardMs: 60 * 60 * 1000,
  },
  network: {
    staleMs: 5 * 60 * 1000,
    hardMs: 15 * 60 * 1000,
  },
} as const;

const AUTO_MAPPING_FAILURE_NAMESPACES = {
  sonarr: 'mapping:auto-failure:sonarr',
  radarr: 'mapping:auto-failure:radarr',
} as const;

const autoMappingFailureCaches = {
  sonarr: createTtlCache<ExtensionError>(AUTO_MAPPING_FAILURE_NAMESPACES.sonarr),
  radarr: createTtlCache<ExtensionError>(AUTO_MAPPING_FAILURE_NAMESPACES.radarr),
} as const;

const getAutoMappingFailureCache = (provider: Provider) =>
  provider === 'radarr' ? autoMappingFailureCaches.radarr : autoMappingFailureCaches.sonarr;

const createAutoMappingFailureCacheKey = (anilistId: AniListId): string => `anilist:${anilistId}`;

const failureTtlFor = (error: ExtensionError): typeof AUTO_MAPPING_FAILURE_TTL.default => {
  if (error.code === ErrorCode.NETWORK_ERROR || error.code === ErrorCode.API_ERROR) {
    return AUTO_MAPPING_FAILURE_TTL.network;
  }

  return AUTO_MAPPING_FAILURE_TTL.default;
};

export async function readAutoMappingFailure(
  provider: Provider,
  anilistId: AniListId,
): Promise<CacheHit<ExtensionError> | null> {
  return getAutoMappingFailureCache(provider).read(createAutoMappingFailureCacheKey(anilistId));
}

export async function writeAutoMappingFailure(
  provider: Provider,
  anilistId: AniListId,
  error: ExtensionError,
): Promise<void> {
  const ttl = failureTtlFor(error);
  await getAutoMappingFailureCache(provider).write(
    createAutoMappingFailureCacheKey(anilistId),
    error,
    ttl,
  );
}

export async function removeAutoMappingFailure(
  provider: Provider,
  anilistId: AniListId,
): Promise<void> {
  await getAutoMappingFailureCache(provider).remove(createAutoMappingFailureCacheKey(anilistId));
}

export async function clearAutoMappingFailures(provider?: Provider): Promise<void> {
  if (provider) {
    await getAutoMappingFailureCache(provider).clear();
    return;
  }

  await Promise.all([
    autoMappingFailureCaches.sonarr.clear(),
    autoMappingFailureCaches.radarr.clear(),
  ]);
}
