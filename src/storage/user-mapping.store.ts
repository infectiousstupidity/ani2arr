/** Authoritative persistence for user-authored mapping decisions such as overrides, ignores, and candidate suppressions. */
// src/lib/storage/user-mapping.store.ts

import { storage } from '@wxt-dev/storage';
import type { MappingExternalId, MappingProvider } from '@/shared/types';
import { STORAGE_KEYS } from './keys';


export interface MappingOverrideEntry {
  provider: MappingProvider;
  externalId: MappingExternalId;
  updatedAt: number;
}

export type MappingOverrideMap = Record<string, MappingOverrideEntry>;

export interface MappingIgnoreEntry {
  provider: MappingProvider;
  updatedAt: number;
}

export type MappingIgnoreMap = Record<string, MappingIgnoreEntry>;

export interface MappingCandidateSuppressionEntry {
  provider: MappingProvider;
  externalId: MappingExternalId;
  updatedAt: number;
}

export type MappingCandidateSuppressionMap = Record<string, MappingCandidateSuppressionEntry>;

export const mappingOverridesStorage = storage.defineItem<MappingOverrideMap>(STORAGE_KEYS.mappingOverrides, {
  fallback: {},
  version: 2,
});

export const mappingIgnoresStorage = storage.defineItem<MappingIgnoreMap>(STORAGE_KEYS.mappingIgnores, {
  fallback: {},
  version: 2,
});

export const mappingRejectedCandidatesStorage = storage.defineItem<MappingCandidateSuppressionMap>(
  STORAGE_KEYS.mappingRejectedCandidates,
  { fallback: {}, version: 2 },
);

export const mappingBlockedCandidatesStorage = storage.defineItem<MappingCandidateSuppressionMap>(
  STORAGE_KEYS.mappingBlockedCandidates,
  { fallback: {}, version: 2 },
);
