/** Authoritative persistence for user-authored mapping decisions such as overrides, ignores, and candidate suppressions. */
// src/mapping/overrides/overrides.storage.ts

import { storage } from '@wxt-dev/storage';
import type { StoredMappingProviderIdEntry, MappingIgnoreEntry } from '@/mapping/overrides/types';
import { STORAGE_KEYS } from '@/storage/keys';

export const mappingOverridesStorage = storage.defineItem<Record<string, StoredMappingProviderIdEntry>>(STORAGE_KEYS.mappingOverrides, {
  fallback: {},
  version: 2,
});

export const mappingIgnoresStorage = storage.defineItem<Record<string, MappingIgnoreEntry>>(STORAGE_KEYS.mappingIgnores, {
  fallback: {},
  version: 2,
});

export const mappingRejectedCandidatesStorage = storage.defineItem<Record<string, StoredMappingProviderIdEntry>>(
  STORAGE_KEYS.mappingRejectedCandidates,
  { fallback: {}, version: 2 },
);
