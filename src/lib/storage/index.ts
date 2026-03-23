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

export type { PersistedMapOptions } from '@/services/mapping/overrides/persisted-map';
export { PersistedMap } from '@/services/mapping/overrides/persisted-map';

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
