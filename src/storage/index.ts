/** Central export surface for the storage layer. Re-exports stores, caches, policies, and helpers. */
// src/lib/storage/index.ts

// Settings store API
export {
  publicOptions,
  sonarrSecrets,
  radarrSecrets,
  parseSettings,
  toPublicOptions,
  getExtensionOptionsSnapshot,
  setExtensionOptionsSnapshot,
  getPublicOptionsSnapshot,
} from './settings.store';

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
export { anilistMediaCache } from './anilist-media.cache';
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
export { providerLibraryCaches } from './provider-library.cache';

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
