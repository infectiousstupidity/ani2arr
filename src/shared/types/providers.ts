export type MediaService = 'sonarr' | 'radarr';

export type SonarrMonitorOption =
  | 'all'
  | 'future'
  | 'missing'
  | 'existing'
  | 'firstSeason'
  | 'lastSeason'
  | 'pilot'
  | 'recent'
  | 'monitorSpecials'
  | 'unmonitorSpecials'
  | 'none';

export type RadarrMinimumAvailability =
  | 'announced'
  | 'inCinemas'
  | 'released'
  | 'preDB';

export interface SonarrSeries {
  id: number;
  title: string;
  tvdbId: number;
  titleSlug: string;
  alternateTitles?: SonarrAlternateTitle[];
  monitored?: boolean;
  year?: number;
  genres?: string[];
  seasonCount?: number;
  episodeCount?: number;
  episodeFileCount?: number;
  sizeOnDisk?: number;
  path?: string;
  rootFolderPath?: string;
  folder?: string;
  qualityProfileId?: number;
  languageProfileId?: number;
  seasons?: unknown[];
  seasonFolder?: boolean;
  monitorNewItems?: 'all' | 'none';
  addOptions?: {
    searchForMissingEpisodes?: boolean;
    monitor?: SonarrMonitorOption;
  };
  seriesType?: 'standard' | 'anime' | 'daily';
  tags?: number[];
  added?: string;
  overview?: string;
  previousAiring?: string | null;
  network?: string;
  // Optional fields commonly available from SeriesResource
  images?: Array<{ coverType?: string; url?: string | null; remoteUrl?: string | null }>;
  remotePoster?: string | null;
  status?: 'continuing' | 'ended' | 'upcoming' | 'deleted';
  statistics?: {
    seasonCount?: number;
    episodeCount?: number;
    episodeFileCount?: number;
    sizeOnDisk?: number;
  };
}

export interface SonarrAlternateTitle {
  title?: string | null;
  sceneSeasonNumber?: number | null;
  seasonNumber?: number | null;
  sourceType?: string | null;
}

export interface SonarrLookupSeries {
  title: string;
  tvdbId: number;
  titleSlug?: string;
  year?: number;
  genres?: string[];
  id?: number;
  // Additional SeriesResource fields available in lookup results
  network?: string;
  seriesType?: 'standard' | 'daily' | 'anime';
  status?: 'continuing' | 'ended' | 'upcoming' | 'deleted';
  images?: Array<{ coverType?: string; url?: string | null; remoteUrl?: string | null }>;
  remotePoster?: string | null;
  statistics?: {
    seasonCount?: number;
    episodeCount?: number;
    episodeFileCount?: number;
    totalEpisodeCount?: number;
  };
}

export interface LeanSonarrSeries {
  tvdbId: number;
  id: number;
  titleSlug: string;
  title: string;
  alternateTitles?: string[];
  statistics?: {
    seasonCount?: number;
    episodeCount?: number;
    episodeFileCount?: number;
    totalEpisodeCount?: number;
    sizeOnDisk?: number;
    percentOfEpisodes?: number;
  };
}

export interface SonarrRootFolder {
  freeSpace: number;
  id: number;
  path: string;
}

export interface SonarrQualityProfile {
  id: number;
  name: string;
}

export interface SonarrTag {
  id: number;
  label: string;
}

export interface RadarrRootFolder {
  freeSpace: number;
  id: number;
  path: string;
}

export interface RadarrQualityProfile {
  id: number;
  name: string;
}

export interface RadarrTag {
  id: number;
  label: string;
}

export interface RadarrAlternateTitle {
  title?: string | null;
  sourceType?: string | null;
  movieMetadataId?: number | null;
}

export interface RadarrMovie {
  id: number;
  title: string;
  tmdbId: number;
  imdbId?: string | null;
  titleSlug?: string;
  sortTitle?: string;
  originalTitle?: string;
  alternateTitles?: RadarrAlternateTitle[];
  monitored?: boolean;
  year?: number;
  runtime?: number;
  status?: string;
  overview?: string;
  genres?: string[];
  path?: string;
  rootFolderPath?: string;
  folderName?: string;
  qualityProfileId?: number;
  minimumAvailability?: RadarrMinimumAvailability;
  tags?: number[];
  hasFile?: boolean;
  movieFileId?: number;
  sizeOnDisk?: number;
  added?: string;
  inCinemas?: string | null;
  digitalRelease?: string | null;
  physicalRelease?: string | null;
  images?: Array<{ coverType?: string; url?: string | null; remoteUrl?: string | null }>;
  movieFile?: {
    id?: number;
    path?: string;
    relativePath?: string;
    size?: number;
    quality?: unknown;
  };
  addOptions?: {
    searchForMovie?: boolean;
  };
}

export interface RadarrLookupMovie {
  title: string;
  tmdbId: number;
  imdbId?: string | null;
  titleSlug?: string;
  sortTitle?: string;
  year?: number;
  runtime?: number;
  status?: string;
  overview?: string;
  genres?: string[];
  monitored?: boolean;
  minimumAvailability?: RadarrMinimumAvailability;
  images?: Array<{ coverType?: string; url?: string | null; remoteUrl?: string | null }>;
  alternateTitles?: RadarrAlternateTitle[];
  folderName?: string;
  remotePoster?: string | null;
  hasFile?: boolean;
  id?: number;
}

export interface LeanRadarrMovie {
  tmdbId: number;
  id: number;
  title: string;
  titleSlug?: string;
  sortTitle?: string;
  originalTitle?: string;
  folderName?: string;
  imdbId?: string | null;
  year?: number;
  alternateTitles?: string[];
  monitored?: boolean;
  minimumAvailability?: RadarrMinimumAvailability;
  hasFile?: boolean;
  sizeOnDisk?: number;
  status?: string;
}

/**
 * Represents a single item returned by the Sonarr `/wanted/cutoff` endpoint.
 * The Sonarr API payloads may vary by version; keep this intentionally
 * permissive while exposing the commonly-used fields.
 */
export interface SonarrCutoffItem {
  id?: number;
  seriesId?: number;
  tvdbId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  title?: string;
  overview?: string | null;
  airDate?: string | null;
  quality?: string | null;
  sizeOnDisk?: number | null;
  // Allow other unknown fields returned by Sonarr
  [key: string]: unknown;
}

export type SonarrCutoffList = SonarrCutoffItem[];
