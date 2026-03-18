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

export const mappingOverridesStorage = storage.defineItem<MappingOverrideMap>('local:mappingOverrides', {
  fallback: {},
  version: 2,
});

export const mappingIgnoresStorage = storage.defineItem<MappingIgnoreMap>('local:ignoredMappings', {
  fallback: {},
  version: 2,
});

export const mappingRejectedCandidatesStorage = storage.defineItem<MappingCandidateSuppressionMap>(
  'local:rejectedMappingCandidates',
  { fallback: {}, version: 2 },
);

export const mappingBlockedCandidatesStorage = storage.defineItem<MappingCandidateSuppressionMap>(
  'local:blockedMappingCandidates',
  { fallback: {}, version: 2 },
);
