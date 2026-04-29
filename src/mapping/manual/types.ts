/** Manual mapping-owned persisted entry types for manual mappings, ignored mappings, and rejected candidates. */
// src/mapping/manual/types.ts

import type { Provider, TmdbId, TvdbId } from '@/providers';

export type StoredMappingProviderIdEntry =
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

export interface MappingIgnoreEntry {
  provider: Provider;
  updatedAt: number;
}
