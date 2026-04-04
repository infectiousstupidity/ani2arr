/** Central export surface for storage keys, revisions, and cache-backed persistence. */
// src/storage/index.ts

// Revisions
export type { RevisionKey } from './revisions.store';
export {
  getRevision,
  bumpRevision,
  resetAllRevisions,
} from './revisions.store';

// Policies
export { STORAGE_POLICIES } from './policies';

// Mapping user state persistence
export type {
  MappingIgnoreEntry,
  StoredMappingExternalIdEntry,
} from '@/services/mapping/overrides/types';

export {
  mappingOverridesStorage,
  mappingIgnoresStorage,
  mappingRejectedCandidatesStorage,
  mappingBlockedCandidatesStorage,
} from './user-mapping.store';

export type { PersistedMapOptions } from './persisted-map';
export { PersistedMap } from './persisted-map';

// Typed cache wrappers
export {
  type ExtensionMappingCacheEntry,
  readExtensionMapping,
  writeExtensionMapping,
  removeExtensionMapping,
  clearExtensionMappings,
  readExtensionMappingFailure,
  writeExtensionMappingFailure,
  removeExtensionMappingFailure,
  clearExtensionMappingFailures,
} from './extension-mapping.cache';
export { upstreamMappingCaches } from './upstream-mapping.cache';
export { sonarrLookupCaches, radarrLookupCaches } from './lookup.cache';
export { providerLibraryCaches } from '@/providers/library/cache';

// TTL cache primitives
export type {
  CacheEntry,
  CacheHit,
  CacheWriteOptions,
  TtlCache,
} from './ttl-cache';

export {
  clearAllTtlCaches,
  createTtlCache,
} from './ttl-cache';

export { STORAGE_KEYS, REVISION_KEYS, CACHE_NAMESPACES } from './keys';
