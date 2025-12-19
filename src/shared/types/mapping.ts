export type RequestPriority = 'high' | 'normal' | 'low';

import type { MediaService } from './providers';

export type MappingSource = 'manual' | 'upstream' | 'auto' | 'ignored';
export type MappingStatus = 'unmapped' | 'in-provider' | 'not-in-provider';
export type MappingProvider = MediaService;

export type MappingExternalIdKind = 'tvdb' | 'tmdb';

export interface MappingExternalId {
  id: number;
  kind: MappingExternalIdKind;
}

export interface MappingSummary {
  anilistId: number;
  provider: MappingProvider;
  externalId: MappingExternalId | null;
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
  tvdbId: number;
  updatedAt: number;
}

export interface MappingIgnoreRecord {
  anilistId: number;
  updatedAt: number;
}
