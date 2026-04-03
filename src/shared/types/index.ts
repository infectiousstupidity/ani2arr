/** Public shared type surface for app-wide canonical types. */
// src/shared/types/index.ts

export type {
  Provider,
  ProviderCredentials,
  ProviderMetadata,
  RadarrLookupMovie,
  RadarrMovie,
  RadarrMovieSnapshot,
  SonarrLookupSeries,
  SonarrSeries,
  SonarrSeriesSnapshot,
  ProviderTag,
  ProviderQualityProfile,
  ProviderRootFolder,
} from './providers';
export type { AniListTitleLanguage } from '@/shared/schemas/anilist/anilist-title-language.schema';

export type {
  SonarrFormState,
  SonarrMonitorOption,
  SonarrSeriesType,
} from '@/shared/schemas/providers/sonarr-settings.schema';

export type {
  RadarrFormState,
  RadarrMinimumAvailability,
} from '@/shared/schemas/providers/radarr-settings.schema';

export type {
  ExtensionOptions,
  PublicOptions,
  UiOptions,
  BadgeVisibility,
} from './options';

export {
  type MappingExternalIdRecord,
  type MappingSummary,
  type MappingSource,
  type MappingStatus,
  type MappingIgnoreRecord,
  type MappingExternalId,
  type MappingExternalIdKind,
} from './mapping';

export type { RequestPriority } from './request-scheduling';

export {
  type AnchorCorner,
  type StackDirection,
  type BrowseAdapter,
  type CardOverlayProps,
  type ParsedCard,
} from './ui';
