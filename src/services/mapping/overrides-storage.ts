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
