import type { MediaMetadataHint } from './anilist';
import type {
  LeanRadarrMovie,
  LeanSonarrSeries,
  RadarrLookupMovie,
  RadarrMovie,
  RadarrMinimumAvailability,
  SonarrLookupSeries,
  SonarrSeries,
  SonarrMonitorOption,
} from './providers';
import type { MappingExternalId } from './mapping';

export type BadgeVisibility = 'always' | 'hover' | 'hidden';

export interface UiOptions {
  browseOverlayEnabled: boolean;
  badgeVisibility: BadgeVisibility;
  headerInjectionEnabled: boolean;
  schedulerDebugOverlayEnabled: boolean;
}

export interface SonarrFormState {
  qualityProfileId: number | '';
  rootFolderPath: string;
  seriesType: 'standard' | 'anime' | 'daily';
  monitorOption: SonarrMonitorOption;
  seasonFolder: boolean;
  searchForMissingEpisodes: boolean;
  searchForCutoffUnmet: boolean;
  tags: number[];
  freeformTags: string[];
}

export interface RadarrFormState {
  qualityProfileId: number | '';
  rootFolderPath: string;
  monitored: boolean;
  searchForMovie: boolean;
  minimumAvailability: RadarrMinimumAvailability;
  tags: number[];
  freeformTags: string[];
}

export type TitleLanguage = 'english' | 'romaji' | 'native';

export interface SonarrSettings {
  url: string;
  apiKey: string;
  defaults: SonarrFormState;
}

export interface RadarrSettings {
  url: string;
  apiKey: string;
  defaults: RadarrFormState;
}

export interface ProviderSettings {
  sonarr: SonarrSettings;
  radarr: RadarrSettings;
}

export interface ExtensionOptions {
  providers: ProviderSettings;
  titleLanguage: TitleLanguage;
  ui: UiOptions;
  debugLogging: boolean;
}

export interface SonarrPublicSettings {
  url: string;
  defaults: SonarrFormState;
  isConfigured: boolean;
}

export interface RadarrPublicSettings {
  url: string;
  defaults: RadarrFormState;
  isConfigured: boolean;
}

export interface ProviderPublicOptions {
  sonarr: SonarrPublicSettings;
  radarr: RadarrPublicSettings;
}

/**
 * Public-facing configuration data that is safe to expose to content scripts.
 * Secrets (like provider API keys) are intentionally excluded.
 */
export interface PublicOptions {
  providers: ProviderPublicOptions;
  titleLanguage: TitleLanguage;
  ui: UiOptions;
  debugLogging: boolean;
}

/**
 * Sensitive credentials that must remain in background or options contexts.
 */
export interface SonarrSecrets {
  apiKey: string;
}

export interface RadarrSecrets {
  apiKey: string;
}

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

export interface ArrCredentialsPayload {
  url: string;
  apiKey: string;
}

export type SonarrCredentialsPayload = ArrCredentialsPayload;

export type RadarrCredentialsPayload = ArrCredentialsPayload;

export type TestConnectionPayload = ArrCredentialsPayload;
