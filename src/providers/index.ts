/** Narrow public provider surface for shared provider contracts and routing helpers. */
// src/providers/index.ts

export type {
  Provider,
  ProviderCredentials,
  ProviderMetadata,
  ProviderQualityProfile,
  ProviderRootFolder,
  ProviderTag,
} from './types';
export type {
  RadarrLookupMovie,
  RadarrMovie,
  RadarrMovieSnapshot,
} from './radarr.types';
export type {
  SonarrLookupSeries,
  SonarrSeries,
  SonarrSeriesSnapshot,
} from './sonarr.types';
export {
  getProviderBaseUrl,
  getProviderDescriptor,
  getProviderLabel,
  isProviderConfigured,
  resolveProviderForAniListFormat,
} from './provider-routing';
