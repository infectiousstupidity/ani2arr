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

// Mapping user state persistence
export type {
  MappingOverrideEntry,
  MappingOverrideMap,
  MappingIgnoreEntry,
  MappingIgnoreMap,
  MappingCandidateSuppressionEntry,
  MappingCandidateSuppressionMap,
} from '@/services/mapping/overrides/storage';

export {
  mappingOverridesStorage,
  mappingIgnoresStorage,
  mappingRejectedCandidatesStorage,
  mappingBlockedCandidatesStorage,
} from '@/services/mapping/overrides/storage';

export type { PersistedMapOptions } from '@/services/mapping/overrides/persisted-map';
export { PersistedMap } from '@/services/mapping/overrides/persisted-map';

// TTL cache primitives
export type {
  CacheEntry,
  CacheHit,
  CacheWriteOptions,
  TtlCache,
} from '@/cache/ttl-cache';

export {
  clearAllTtlCaches,
  createTtlCache,
} from '@/cache/ttl-cache';
