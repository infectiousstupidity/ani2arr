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
  MappingProviderIdRecord,
  MappingIgnoreRecord,
  MappingSummary,
} from '@/mapping/types';
import type { MappingInspectionPayload } from '@/mapping/inspection/inspection-types';
import type { MappingCursor } from './schemas';

export interface CheckSeriesStatusResponse {
  exists: boolean;
  tvdbId: number | null;
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
  successfulSynonym?: string;
  anilistTmdbLinkMissing?: boolean;
  movie?: RadarrMovieSnapshot | RadarrMovie | RadarrLookupMovie;
  /** True when a manual AniList -> TMDB override is active for this ID. */
  overrideActive?: boolean;
  /** Other AniList IDs currently linked to the same TMDB ID. */
  linkedAniListIds?: number[];
}

export interface ExportStoredMappingsOutput {
  version: 4;
  exportedAt: string;
  summary: {
    overrideCount: number;
    ignoreCount: number;
    rejectedCandidateCount: number;
  };
  mappings: {
    overrides: Record<string, MappingProviderIdRecord>;
    ignores: Record<string, MappingIgnoreRecord>;
    rejectedCandidates: Record<string, MappingProviderIdRecord>;
  };
}

export interface GetMappingsOutput {
  mappings: MappingSummary[];
  nextCursor?: MappingCursor | null;
  total?: number;
}

export type GetMappingInspectionOutput = MappingInspectionPayload;

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
