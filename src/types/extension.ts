import type { MediaMetadataHint } from './anilist';
import type {
  LeanSonarrSeries,
  SonarrMonitorOption,
} from './sonarr';

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

/**
 * Public-facing configuration data that is safe to expose to content scripts.
 * Secrets (like the Sonarr API key) are intentionally excluded.
 */
export interface PublicOptions {
  sonarrUrl: string;
  defaults: SonarrFormState;
  /**
   * Indicates whether the user has completed Sonarr setup (URL + API key).
   * This is derived in the background and mirrored into public storage.
   */
  isConfigured: boolean;
}

/**
 * Sensitive credentials that must remain in background or options contexts.
 */
export interface SonarrSecrets {
  apiKey: string;
}

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
  successfulSynonym?: string;
  anilistTvdbLinkMissing?: boolean;
  series?: LeanSonarrSeries;
  /** True when a manual AniList -> TVDB override is active for this ID. */
  overrideActive?: boolean;
}

export interface SonarrCredentialsPayload {
  url: string;
  apiKey: string;
}

export type TestConnectionPayload = SonarrCredentialsPayload;
