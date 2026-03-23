// src/lib/storage/keys.ts

/**
 * Central registry for persistent storage keys and cache namespaces.
 *
 * Rules:
 * - Only put real persisted keys or real TTL cache namespaces here.
 * - Keep names domain-oriented and stable.
 * - Do not put React Query keys here.
 * - Do not put sessionStorage keys here.
 */

// WXT / browser.storage.local keys for real extension state.
export const STORAGE_KEYS = {
  publicOptions: 'local:publicOptions',
  sonarrSecrets: 'local:sonarrSecrets',
  radarrSecrets: 'local:radarrSecrets',
  mappingOverrides: 'local:mappingOverrides',
  mappingIgnores: 'local:ignoredMappings',
  mappingRejectedCandidates: 'local:rejectedMappingCandidates',
  mappingBlockedCandidates: 'local:blockedMappingCandidates',
} as const;

// Cross-context invalidation counters.
export const REVISION_KEYS = {
  settings: 'settingsRevision',
  mappings: 'mappingsRevision',
  sonarrLibrary: 'sonarrLibraryRevision',
  radarrLibrary: 'radarrLibraryRevision',
} as const;

// Persistent TTL cache namespaces.
// Keep currently used namespaces until the consuming cache layer is actually removed.
export const CACHE_NAMESPACES = {
  // AniList
  anilistMedia: 'anilist:media',

  // Mapping - upstream static inputs
  mappingStaticPrimary: 'mapping:static:primary',
  mappingStaticFallback: 'mapping:static:fallback',

  // Mapping - provider lookup results
  mappingLookupPositiveSonarr: 'mapping:lookup:sonarr',
  mappingLookupNegativeSonarr: 'mapping:lookup-negative:sonarr',
  mappingLookupPositiveRadarr: 'mapping:lookup:radarr',
  mappingLookupNegativeRadarr: 'mapping:lookup-negative:radarr',

  // Mapping - currently still used by MappingService
  mappingResolvedSuccessSonarr: 'mapping:success:sonarr',
  mappingResolvedFailureSonarr: 'mapping:failure:sonarr',
  mappingResolvedSuccessRadarr: 'mapping:success:radarr',
  mappingResolvedFailureRadarr: 'mapping:failure:radarr',

  // Provider library
  libraryLeanSonarr: 'library:lean:sonarr',
  libraryLeanRadarr: 'library:lean:radarr',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
export type CacheNamespace = (typeof CACHE_NAMESPACES)[keyof typeof CACHE_NAMESPACES];
