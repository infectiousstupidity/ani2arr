/** Manual mapping-owned persisted entry types for manual mappings, ignored mappings, and rejected candidates. */
// src/mapping/manual/types.ts

import type { AniListId } from '@/anilist';
import type { Provider, TmdbId, TvdbId } from '@/providers';

export type PersistedProviderMappingRecord =
  | {
      anilistId: AniListId;
      provider: 'sonarr';
      providerId: TvdbId;
      updatedAt: number;
    }
  | {
      anilistId: AniListId;
      provider: 'radarr';
      providerId: TmdbId;
      updatedAt: number;
    };

export interface PersistedMappingIgnoreRecord {
  anilistId: AniListId;
  provider: Provider;
  updatedAt: number;
}

export type StoredProviderMappingEntry =
  | {
      provider: 'sonarr';
      providerId: TvdbId;
      updatedAt: number;
    }
  | {
      provider: 'radarr';
      providerId: TmdbId;
      updatedAt: number;
    };

export interface StoredMappingIgnoreEntry {
  provider: Provider;
  updatedAt: number;
}
