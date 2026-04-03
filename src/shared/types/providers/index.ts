/** Public provider type surface for shared provider-common, Sonarr, and Radarr types. */
// src/shared/types/providers/index.ts

export type {
  Provider,
  ProviderCredentials,
  ProviderMetadata,
  ProviderQualityProfile,
  ProviderRootFolder,
  ProviderTag,
} from './common';

export type {
  SonarrLookupSeries,
  SonarrSeries,
  SonarrSeriesSnapshot,
} from './sonarr';

export type {
  RadarrLookupMovie,
  RadarrMovie,
  RadarrMovieSnapshot,
} from './radarr';
