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
  type MappingBlockedRecord,
  type MappingOverrideRecord,
  type MappingRejectedRecord,
  type MappingSummary,
  type MappingProvider,
  type MappingSource,
  type MappingStatus,
  type MappingIgnoreRecord,
  type MappingExternalId,
  type MappingExternalIdKind,
  type RequestPriority,
} from './mapping';

export {
  type AnchorCorner,
  type StackDirection,
  type MappingSearchResult,
  type BrowseAdapter,
  type CardOverlayProps,
  type ParsedCard,
} from './ui';
