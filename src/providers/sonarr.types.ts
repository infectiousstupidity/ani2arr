/** Sonarr resource types owned by the provider domain. */
// src/providers/sonarr.types.ts

import type { SonarrMonitorOption, SonarrSeriesType } from '@/providers/settings/sonarr-settings.schema';

export interface SonarrSeries {
  id: number;
  title: string;
  tvdbId: number;
  titleSlug: string;
  alternateTitles?: Array<{
    title?: string | null;
    sceneSeasonNumber?: number | null;
    seasonNumber?: number | null;
    sourceType?: string | null;
  }>;
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
    searchForCutoffUnmetEpisodes?: boolean;
    monitor?: SonarrMonitorOption;
  };
  seriesType?: SonarrSeriesType;
  tags?: number[];
  added?: string;
  overview?: string;
  previousAiring?: string | null;
  network?: string;
  images?: Array<{ coverType?: string; url?: string | null; remoteUrl?: string | null }>;
  remotePoster?: string | null;
  status?: 'continuing' | 'ended' | 'upcoming' | 'deleted';
  statistics?: {
    seasonCount?: number;
    episodeCount?: number;
    episodeFileCount?: number;
    totalEpisodeCount?: number;
    sizeOnDisk?: number;
  };
}

export interface SonarrSeriesSnapshot {
  id: number;
  tvdbId: number;
  title: string;
  titleSlug: string;
  alternateTitles?: string[];
  statistics?: {
    episodeCount?: number;
    episodeFileCount?: number;
    totalEpisodeCount?: number;
  };
}

export interface SonarrLookupSeries {
  title: string;
  tvdbId: number;
  titleSlug?: string;
  year?: number;
  genres?: string[];
  id?: number;
  network?: string;
  seriesType?: SonarrSeriesType;
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
