/** Canonical mapping-domain types shared across mapping services, storage, and UI summaries. */
// src/shared/types/mapping.ts

import type { Provider } from '@/shared/types/providers';

export type MappingSource = 'manual' | 'upstream' | 'auto' | 'rejected' | 'blocked' | 'ignored' | 'unresolved';
export type MappingStatus = 'unmapped' | 'in-provider' | 'not-in-provider';

export type MappingExternalIdKind = 'tvdb' | 'tmdb';

export interface MappingExternalId {
  id: number;
  kind: MappingExternalIdKind;
}

export interface MappingSummary {
  anilistId: number;
  provider: Provider;
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

export interface MappingExternalIdRecord {
  anilistId: number;
  provider: Provider;
  externalId: MappingExternalId;
  updatedAt: number;
}

export interface MappingIgnoreRecord {
  anilistId: number;
  provider: Provider;
  updatedAt: number;
}
