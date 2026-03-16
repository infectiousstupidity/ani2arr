// src/services/mapping/overrides-storage.ts
import { storage } from '@wxt-dev/storage';
import type { MappingExternalId, MappingProvider } from '@/shared/types';

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

// Sync store: authoritative source replicated across devices (no secrets)
export const mappingOverridesSync = storage.defineItem<MappingOverrideMap>('sync:mappingOverrides', {
  fallback: {},
  version: 1,
});

// Local mirror: hot-path reads and startup hydration
export const mappingOverridesLocal = storage.defineItem<MappingOverrideMap>('local:mappingOverridesCache', {
  fallback: {},
  version: 1,
});

// Ignored mappings (negative overrides)
export const mappingIgnoresSync = storage.defineItem<MappingIgnoreMap>('sync:ignoredMappings', {
  fallback: {},
  version: 1,
});

export const mappingIgnoresLocal = storage.defineItem<MappingIgnoreMap>('local:ignoredMappingsCache', {
  fallback: {},
  version: 1,
});

export const mappingRejectedCandidatesSync = storage.defineItem<MappingCandidateSuppressionMap>('sync:rejectedMappingCandidates', {
  fallback: {},
  version: 1,
});

export const mappingRejectedCandidatesLocal = storage.defineItem<MappingCandidateSuppressionMap>('local:rejectedMappingCandidatesCache', {
  fallback: {},
  version: 1,
});

export const mappingBlockedCandidatesSync = storage.defineItem<MappingCandidateSuppressionMap>('sync:blockedMappingCandidates', {
  fallback: {},
  version: 1,
});

export const mappingBlockedCandidatesLocal = storage.defineItem<MappingCandidateSuppressionMap>('local:blockedMappingCandidatesCache', {
  fallback: {},
  version: 1,
});
