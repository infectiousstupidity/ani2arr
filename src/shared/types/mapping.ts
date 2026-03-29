export type RequestPriority = 'high' | 'normal' | 'low';

import type { Provider } from '@/shared/types/providers';

export type MappingSource = 'manual' | 'upstream' | 'auto' | 'rejected' | 'blocked' | 'ignored' | 'unresolved';
export type MappingStatus = 'unmapped' | 'in-provider' | 'not-in-provider';
export type MappingProvider = Provider;

export type MappingExternalIdKind = 'tvdb' | 'tmdb';

export interface MappingExternalId {
  id: number;
  kind: MappingExternalIdKind;
}

export interface MappingSummary {
  anilistId: number;
  provider: MappingProvider;
  externalId: MappingExternalId | null;
  suppressedExternalId?: MappingExternalId | null;
  source: MappingSource;
  status: MappingStatus;
  updatedAt?: number;
  linkedAniListIds?: readonly number[];
  inLibraryCount?: number;
  providerMeta?: {
    title?: string;
    type?: 'series' | 'movie';
    statusLabel?: string;
  };
  hadResolveAttempt?: boolean;
}

export interface MappingOverrideRecord {
  anilistId: number;
  provider: MappingProvider;
  externalId: MappingExternalId;
  updatedAt: number;
}

export interface MappingIgnoreRecord {
  anilistId: number;
  provider: MappingProvider;
  updatedAt: number;
}

export interface MappingRejectedRecord {
  anilistId: number;
  provider: MappingProvider;
  externalId: MappingExternalId;
  updatedAt: number;
}

export interface MappingBlockedRecord {
  anilistId: number;
  provider: MappingProvider;
  externalId: MappingExternalId;
  updatedAt: number;
}
