/** Registry of persistent storage keys, revision keys, and cache namespaces used by the storage layer. */
// src/lib/storage/keys.ts

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
export const CACHE_NAMESPACES = {
  // AniList media
  anilistMedia: 'anilist:media',

  // Upstream mapping sources
  upstreamMappingPrimary: 'mapping:upstream:primary',
  upstreamMappingFallback: 'mapping:upstream:fallback',

  // Provider lookup results
  providerLookupPositiveSonarr: 'mapping:lookup:sonarr',
  providerLookupNegativeSonarr: 'mapping:lookup-negative:sonarr',
  providerLookupPositiveRadarr: 'mapping:lookup:radarr',
  providerLookupNegativeRadarr: 'mapping:lookup-negative:radarr',

  // Extension-derived mapping results
  extensionMappingSonarr: 'mapping:extension:sonarr',
  extensionMappingRadarr: 'mapping:extension:radarr',

  // Extension-derived mapping failures
  extensionMappingFailureSonarr: 'mapping:extension-failure:sonarr',
  extensionMappingFailureRadarr: 'mapping:extension-failure:radarr',

  // Provider library snapshots
  libraryLeanSonarr: 'library:lean:sonarr',
  libraryLeanRadarr: 'library:lean:radarr',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
export type CacheNamespace = (typeof CACHE_NAMESPACES)[keyof typeof CACHE_NAMESPACES];
