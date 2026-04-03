/** Authoritative persistence for user-authored mapping decisions such as overrides, ignores, and candidate suppressions. */
// src/lib/storage/user-mapping.store.ts

import { storage } from '@wxt-dev/storage';
import type { StoredMappingExternalIdEntry, MappingIgnoreEntry } from '@/services/mapping/overrides/types';
import { STORAGE_KEYS } from './keys';

export const mappingOverridesStorage = storage.defineItem<Record<string, StoredMappingExternalIdEntry>>(STORAGE_KEYS.mappingOverrides, {
  fallback: {},
  version: 2,
});

export const mappingIgnoresStorage = storage.defineItem<Record<string, MappingIgnoreEntry>>(STORAGE_KEYS.mappingIgnores, {
  fallback: {},
  version: 2,
});

export const mappingRejectedCandidatesStorage = storage.defineItem<Record<string, StoredMappingExternalIdEntry>>(
  STORAGE_KEYS.mappingRejectedCandidates,
  { fallback: {}, version: 2 },
);

export const mappingBlockedCandidatesStorage = storage.defineItem<Record<string, StoredMappingExternalIdEntry>>(
  STORAGE_KEYS.mappingBlockedCandidates,
  { fallback: {}, version: 2 },
);
