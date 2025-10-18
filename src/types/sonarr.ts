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
  qualityProfileId?: number;
  languageProfileId?: number;
  seasons?: unknown[];
  seriesType?: 'standard' | 'anime' | 'daily';
  tags?: unknown[];
  added?: string;
  overview?: string;
  previousAiring?: string | null;
  network?: string;
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
}

export interface LeanSonarrSeries {
  tvdbId: number;
  id: number;
  titleSlug: string;
  title: string;
  alternateTitles?: string[];
}

export interface SonarrRootFolder {
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
