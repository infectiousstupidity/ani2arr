/** Mapping service input and output types for AniList-driven resolution flows. */
// src/mapping/types.ts

import type { AniListMediaHint } from '@/anilist/schemas/media.schema';
import type { Provider } from '@/providers';
import type { RequestPriority } from '@/shared/utils/request-priority';

export type MappingSource = 'manual' | 'upstream' | 'auto' | 'rejected' | 'ignored' | 'unresolved';
export type MappingStatus = 'unmapped' | 'in-provider' | 'not-in-provider';

export interface MappingSummary {
  anilistId: number;
  provider: Provider;
  providerId: number | null;
  suppressedProviderId?: number | null;
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

export interface MappingProviderIdRecord {
  anilistId: number;
  provider: Provider;
  providerId: number;
  updatedAt: number;
}

export interface MappingIgnoreRecord {
  anilistId: number;
  provider: Provider;
  updatedAt: number;
}

export interface ResolvedMapping {
  providerId: number;
  successfulSynonym?: string;
}

export interface ResolveProviderIdOptions {
  network?: 'never';
  hints?: {
    primaryTitle?: string;
    domMedia?: AniListMediaHint | null;
  };
  ignoreFailureCache?: boolean;
  priority?: RequestPriority;
  // Force provider lookups to bypass fresh caches (used by anime detail force-verify).
  forceLookupNetwork?: boolean;
}
