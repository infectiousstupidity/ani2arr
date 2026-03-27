/** Plain RPC payload and response types that do not need runtime schemas. */
// src/rpc/types.ts

import type { AniListMetadata, AniListMediaHint, AniListMediaStatus, AniListMediaFormat, AniListTitles } from '@/shared/types/anilist';
import type {
  LeanRadarrMovie,
  LeanSonarrSeries,
  ProviderTag,
  RadarrLookupMovie,
  RadarrQualityProfile,
  RadarrRootFolder,
  RadarrMovie,
  SonarrLookupSeries,
  SonarrRootFolder,
  SonarrQualityProfile,
  SonarrSeries,
} from '@/shared/types/providers';
import type { AniListSchedulerDebugSnapshot } from '@/debug/anilist-debug.types';
import type { MappingExternalId } from '@/shared/types/mapping';
import type { ProviderCredentials } from '@/shared/types/options';
import type { SonarrFormState } from '@/shared/providers/sonarr/types';
import type { MappingSummary } from '@/shared/types';
import type { MappingCursor } from './schemas';

/**
 * Payload used when adding a series.
 * Inherits all Sonarr form fields (including tags/freeformTags) as optional.
 */
export interface AddRequestPayload extends Partial<SonarrFormState> {
  title: string;
  anilistId: number;
  tvdbId?: number;
  metadata?: AniListMediaHint | null;
}

export interface CheckSeriesStatusPayload {
  anilistId: number;
  title?: string;
  metadata?: AniListMediaHint | null;
}

export interface CheckSeriesStatusResponse {
  exists: boolean;
  tvdbId: number | null;
  externalId?: MappingExternalId | null;
  successfulSynonym?: string;
  anilistTvdbLinkMissing?: boolean;
  series?: LeanSonarrSeries | SonarrSeries | SonarrLookupSeries;
  /** True when a manual AniList -> TVDB override is active for this ID. */
  overrideActive?: boolean;
  /** Other AniList IDs currently linked to the same TVDB ID (overrides or static pairs). */
  linkedAniListIds?: number[];
}

export interface CheckMovieStatusPayload {
  anilistId: number;
  title?: string;
  metadata?: AniListMediaHint | null;
}

export interface CheckMovieStatusResponse {
  exists: boolean;
  tmdbId: number | null;
  externalId?: MappingExternalId | null;
  successfulSynonym?: string;
  anilistTmdbLinkMissing?: boolean;
  movie?: LeanRadarrMovie | RadarrMovie | RadarrLookupMovie;
  /** True when a manual AniList -> TMDB override is active for this ID. */
  overrideActive?: boolean;
  /** Other AniList IDs currently linked to the same TMDB ID. */
  linkedAniListIds?: number[];
}

export type TestConnectionPayload = ProviderCredentials;

export interface MappingOutput {
  tvdbId: number | null;
  successfulSynonym?: string;
}

export type StatusOutput = CheckSeriesStatusResponse;
export type MovieStatusOutput = CheckMovieStatusResponse;

export interface MappingOverrideItem {
  anilistId: number;
  provider: 'sonarr' | 'radarr';
  externalId: {
    id: number;
    kind: 'tvdb' | 'tmdb';
  };
  updatedAt: number;
}

export interface MappingIgnoreItem {
  anilistId: number;
  provider: 'sonarr' | 'radarr';
  updatedAt: number;
}

export interface MappingRejectedCandidateItem {
  anilistId: number;
  provider: 'sonarr' | 'radarr';
  externalId: {
    id: number;
    kind: 'tvdb' | 'tmdb';
  };
  updatedAt: number;
}

export interface MappingBlockedCandidateItem {
  anilistId: number;
  provider: 'sonarr' | 'radarr';
  externalId: {
    id: number;
    kind: 'tvdb' | 'tmdb';
  };
  updatedAt: number;
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
    overrides: Record<string, MappingOverrideItem>;
    ignores: Record<string, MappingIgnoreItem>;
    rejectedCandidates: Record<string, MappingRejectedCandidateItem>;
    blockedCandidates: Record<string, MappingBlockedCandidateItem>;
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
      seasonCount?: number;
      episodeCount?: number;
      episodeFileCount?: number;
      totalEpisodeCount?: number;
      sizeOnDisk?: number;
      percentOfEpisodes?: number;
    }
  >;
}

export interface ValidateTvdbOutput {
  inLibrary: boolean;
  inCatalog: boolean;
}

export interface RadarrLookupOutput {
  results: RadarrLookupMovie[];
  libraryTmdbIds: number[];
  linkedAniListIdsByTmdbId?: Record<number, number[]>;
}

export interface ValidateTmdbOutput {
  inLibrary: boolean;
  inCatalog: boolean;
}

export interface GetRadarrMetadataOutput {
  qualityProfiles: RadarrQualityProfile[];
  rootFolders: RadarrRootFolder[];
  tags: ProviderTag[];
}

export type AddRadarrOutput = RadarrMovie;
export type UpdateRadarrOutput = RadarrMovie;

export interface GetAniListMetadataOutput {
  metadata: AniListMetadata[];
  missingIds?: number[];
}

export interface AniListSearchResult {
  id: number;
  title: AniListTitles;
  coverImage?: AniListMetadata['coverImage'] | null;
  format?: AniListMediaFormat | null;
  status?: AniListMediaStatus | null;
}

export type GetAniListSchedulerDebugOutput = AniListSchedulerDebugSnapshot;
export type SonarrMetadataOutput = {
  qualityProfiles: SonarrQualityProfile[];
  rootFolders: SonarrRootFolder[];
  tags: ProviderTag[];
};
