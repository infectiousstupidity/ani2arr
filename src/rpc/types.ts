import type { MediaMetadataHint } from '@/shared/types/anilist';
import type {
  LeanRadarrMovie,
  LeanSonarrSeries,
  RadarrLookupMovie,
  RadarrMovie,
  SonarrLookupSeries,
  SonarrSeries,
} from '@/shared/types/providers';
import type { MappingExternalId } from '@/shared/types/mapping';
import type { ProviderCredentials } from '@/shared/providers/common/types';
import type { SonarrFormState } from '@/shared/providers/sonarr/types';

/**
 * Payload used when adding a series.
 * Inherits all Sonarr form fields (including tags/freeformTags) as optional.
 */
export interface AddRequestPayload extends Partial<SonarrFormState> {
  title: string;
  anilistId: number;
  tvdbId?: number;
  metadata?: MediaMetadataHint | null;
}

export interface CheckSeriesStatusPayload {
  anilistId: number;
  title?: string;
  metadata?: MediaMetadataHint | null;
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
  metadata?: MediaMetadataHint | null;
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
