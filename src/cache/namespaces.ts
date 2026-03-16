// src/cache/namespaces.ts
// Central registry for persistent cache namespaces used with createTtlCache.
// Keep this list authoritative to avoid key drift and make audits easy.

export const CacheNamespaces = {
  // AniList
  anilistMedia: 'anilist:media',

  // Mapping
  mappingStaticPrimary: 'mapping:static:primary',
  mappingStaticFallback: 'mapping:static:fallback',
  mappingLookupPositiveSonarr: 'mapping:lookup:sonarr',
  mappingLookupNegativeSonarr: 'mapping:lookup-negative:sonarr',
  mappingResolvedSuccessSonarr: 'mapping:success:sonarr',
  mappingResolvedFailureSonarr: 'mapping:failure:sonarr',
  mappingLookupPositiveRadarr: 'mapping:lookup:radarr',
  mappingLookupNegativeRadarr: 'mapping:lookup-negative:radarr',
  mappingResolvedSuccessRadarr: 'mapping:success:radarr',
  mappingResolvedFailureRadarr: 'mapping:failure:radarr',

  // Library
  libraryLeanSonarr: 'library:lean:sonarr',
  libraryLeanRadarr: 'library:lean:radarr',
} as const;

export type CacheNamespace = typeof CacheNamespaces[keyof typeof CacheNamespaces];
