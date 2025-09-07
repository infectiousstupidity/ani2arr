/**
 * @file Central data dictionary for Kitsunarr.
 */

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
  /** Present on v3 Series model */
  year?: number;
  /** Present on v3 Series model */
  genres?: string[];
}

/** Remote lookup item from /series/lookup */
export interface SonarrLookupSeries {
  title: string;
  tvdbId: number;
  titleSlug?: string;
  /** Lookup also includes year/genres */
  year?: number;
  genres?: string[];
  /** Some servers return id when series already exists */
  id?: number;
}

export interface LeanSonarrSeries {
  tvdbId: number;
  id: number;
  titleSlug: string;
}

export interface SonarrRootFolder { id: number; path: string; }

export interface SonarrQualityProfile { id: number; name: string; }

export interface SonarrTag { id: string; label: string; }

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
  tags: string[];
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

export interface CheckSeriesStatusPayload { anilistId: number; }

export interface CheckSeriesStatusResponse {
  exists: boolean;
  tvdbId: number | null;
  successfulSynonym?: string | undefined;
  series?: LeanSonarrSeries;
}

export interface SonarrCredentialsPayload { url: string; apiKey: string; }

export type TestConnectionPayload = SonarrCredentialsPayload;
