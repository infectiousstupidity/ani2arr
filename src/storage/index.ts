/** Central export surface for low-level storage keys, revisions, policies, and TTL primitives. */
// src/storage/index.ts

// Revisions
export type { RevisionKey } from './revisions.store';
export {
  bumpRevision,
  resetAllRevisions,
} from './revisions.store';

// Policies
export { STORAGE_POLICIES } from './policies';
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
