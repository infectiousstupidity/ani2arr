/** Public provider type surface for shared provider-common, Sonarr, and Radarr types. */
// src/shared/types/providers/index.ts

export type {
  Provider,
  ProviderCredentials,
  ProviderQualityProfile,
  ProviderRootFolder,
  ProviderTag,
} from './common';

export type {
  SonarrAlternateTitle,
  SonarrLookupSeries,
  SonarrSeries,
  SonarrSeriesSnapshot,
} from './sonarr';

export type {
  RadarrAlternateTitle,
  RadarrLookupMovie,
  RadarrMovie,
  RadarrMovieSnapshot,
} from './radarr';
