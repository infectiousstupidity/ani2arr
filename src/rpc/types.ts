/** Plain payload and response types used by RPC and adjacent provider flows without runtime schemas. */
// src/rpc/types.ts

import type { AniListMetadata } from '@/anilist/schemas/metadata.schema';
import type {
  RadarrMovieSnapshot,
  RadarrLookupMovie,
  RadarrMovie,
  SonarrSeriesSnapshot,
  SonarrLookupSeries,
  SonarrSeries,
} from '@/providers';
import type {
  MappingExternalIdRecord,
  MappingExternalId,
  MappingIgnoreRecord,
  MappingSummary,
} from '@/mapping/types';
import type { MappingCursor } from './schemas';

export interface CheckSeriesStatusResponse {
  exists: boolean;
  tvdbId: number | null;
  externalId?: MappingExternalId | null;
  successfulSynonym?: string;
  anilistTvdbLinkMissing?: boolean;
  series?: SonarrSeriesSnapshot | SonarrSeries | SonarrLookupSeries;
  /** True when a manual AniList -> TVDB override is active for this ID. */
  overrideActive?: boolean;
  /** Other AniList IDs currently linked to the same TVDB ID (overrides or static pairs). */
  linkedAniListIds?: number[];
}

export interface CheckMovieStatusResponse {
  exists: boolean;
  tmdbId: number | null;
  externalId?: MappingExternalId | null;
  successfulSynonym?: string;
  anilistTmdbLinkMissing?: boolean;
  movie?: RadarrMovieSnapshot | RadarrMovie | RadarrLookupMovie;
  /** True when a manual AniList -> TMDB override is active for this ID. */
  overrideActive?: boolean;
  /** Other AniList IDs currently linked to the same TMDB ID. */
  linkedAniListIds?: number[];
}

export interface ExportStoredMappingsOutput {
  version: 2;
  exportedAt: string;
  summary: {
    overrideCount: number;
    ignoreCount: number;
    rejectedCandidateCount: number;
    blockedCandidateCount: number;
  };
  mappings: {
    overrides: Record<string, MappingExternalIdRecord>;
    ignores: Record<string, MappingIgnoreRecord>;
    rejectedCandidates: Record<string, MappingExternalIdRecord>;
    blockedCandidates: Record<string, MappingExternalIdRecord>;
  };
}

export interface GetMappingsOutput {
  mappings: MappingSummary[];
  nextCursor?: MappingCursor | null;
  total?: number;
}

export interface SonarrLookupOutput {
  results: SonarrLookupSeries[];
  libraryTvdbIds: number[];
  linkedAniListIdsByTvdbId?: Record<number, number[]>;
  statsMap?: Record<
    number,
    {
      episodeCount?: number;
      episodeFileCount?: number;
      totalEpisodeCount?: number;
    }
  >;
}

export interface RadarrLookupOutput {
  results: RadarrLookupMovie[];
  libraryTmdbIds: number[];
  linkedAniListIdsByTmdbId?: Record<number, number[]>;
}

export interface GetAniListMetadataOutput {
  metadata: AniListMetadata[];
  missingIds?: number[];
}
