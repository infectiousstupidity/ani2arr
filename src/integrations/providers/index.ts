/** Public provider-domain type surface for provider integrations and UI flows. */
// src/integrations/providers/index.ts

export type {
  Provider,
  ProviderCredentials,
  ProviderMetadata,
  ProviderQualityProfile,
  ProviderRootFolder,
  ProviderTag,
} from './types';
export type {
  SonarrLookupSeries,
  SonarrSeries,
  SonarrSeriesSnapshot,
} from './sonarr.types';
export type {
  RadarrLookupMovie,
  RadarrMovie,
  RadarrMovieSnapshot,
} from './radarr.types';
