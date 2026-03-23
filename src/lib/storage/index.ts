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
  MappingOverrideEntry,
  MappingOverrideMap,
  MappingIgnoreEntry,
  MappingIgnoreMap,
  MappingCandidateSuppressionEntry,
  MappingCandidateSuppressionMap,
} from './mapping-user-state.store';

export {
  mappingOverridesStorage,
  mappingIgnoresStorage,
  mappingRejectedCandidatesStorage,
  mappingBlockedCandidatesStorage,
} from './mapping-user-state.store';

export type { PersistedMapOptions } from './persisted-map';
export { PersistedMap } from './persisted-map';

// Typed cache wrappers
export { anilistMediaCache } from './anilist-media.cache';
export { staticMappingCaches } from './static-mapping.cache';
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
