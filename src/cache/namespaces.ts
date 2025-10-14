// src/cache/namespaces.ts
// Central registry for persistent cache namespaces used with createTtlCache.
// Keep this list authoritative to avoid key drift and make audits easy.

export const CacheNamespaces = {
  // AniList
  anilistMedia: 'anilist:media',

  // Mapping
  mappingStaticPrimary: 'mapping:static:primary',
  mappingStaticFallback: 'mapping:static:fallback',
  mappingLookupPositive: 'mapping:lookup',
  mappingLookupNegative: 'mapping:lookup-negative',
  mappingResolvedSuccess: 'mapping:success',
  mappingResolvedFailure: 'mapping:failure',

  // Library
  libraryLean: 'library:lean',
} as const;

export type CacheNamespace = typeof CacheNamespaces[keyof typeof CacheNamespaces];
