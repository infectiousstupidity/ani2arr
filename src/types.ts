// src/types.ts

//================================================================
// Sonarr API Enums and Types
//================================================================

export type SonarrMonitorOption =
  | 'all' | 'future' | 'missing' | 'existing' | 'firstSeason'
  | 'lastSeason' | 'pilot' | 'recent' | 'monitorSpecials'
  | 'unmonitorSpecials' | 'none';

export interface SonarrSeries {
  id: number;
  title: string;
  tvdbId: number;
  titleSlug: string;
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

/** Remote lookup item from /series/lookup */
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
}

export interface SonarrRootFolder { id: number; path: string; }

export interface SonarrQualityProfile { id: number; name: string; }

export interface SonarrTag { id: number; label: string; }

//================================================================
// Extension-Specific Types
//================================================================

export interface SonarrFormState {
  qualityProfileId: number | '';
  rootFolderPath: string;
  seriesType: 'standard' | 'anime' | 'daily';
  monitorOption: SonarrMonitorOption;
  seasonFolder: boolean;
  searchForMissingEpisodes: boolean;
  tags: number[]; 
}

export interface ExtensionOptions {
  sonarrUrl: string;
  sonarrApiKey: string;
  defaults: SonarrFormState;
}

//================================================================
// Service Layer: Payloads & Responses
//================================================================

export interface AddRequestPayload extends Partial<SonarrFormState> {
  title: string;
  anilistId: number;
  tvdbId?: number;
}

export interface CheckSeriesStatusPayload {
  anilistId: number;
  title?: string;
}

export interface CheckSeriesStatusResponse {
  exists: boolean;
  tvdbId: number | null;
  successfulSynonym?: string;
  anilistTvdbLinkMissing?: boolean;
  series?: LeanSonarrSeries;
}

export interface SonarrCredentialsPayload { url: string; apiKey: string; }

export type TestConnectionPayload = SonarrCredentialsPayload;


//================================================================
// Error Handling Types
//================================================================

export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  API_ERROR = 'API_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  SONARR_NOT_CONFIGURED = 'SONARR_NOT_CONFIGURED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface ExtensionError {
  code: ErrorCode;
  message: string;
  userMessage: string;
  details?: Record<string, unknown>;
  readonly timestamp: number;
}
