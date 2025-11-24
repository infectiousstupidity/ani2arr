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
    totalEpisodeCount?: number;};
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
