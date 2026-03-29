/** Public shared type surface for app-wide canonical types. */
// src/shared/types/index.ts

export type {
  AniListMediaFormat,
  AniListMedia,
  AniListTitles,
  AniListMediaHint,
  AniListMediaStatus,
  AniListMediaSeason,
  AniListMetadata,
  AniListMetadataCoverImage,
  AniListMetadataChunkRef,
  AniListMetadataBundle,
} from './anilist';

export type {
  AniListSchedulerEventType,
  AniListSchedulerRequestDebug,
  AniListSchedulerPendingEntryDebug,
  AniListSchedulerBucketDebug,
  AniListSchedulerBatchMediaCountsDebug,
  AniListSchedulerBatchDebug,
  AniListSchedulerEventDebug,
  AniListSchedulerLimiterDebug,
  AniListSchedulerDebugSnapshot,
} from '@/debug/anilist-debug.types';

export type {
  Provider,
  ProviderCredentials,
  RadarrAlternateTitle,
  RadarrLookupMovie,
  RadarrMovie,
  RadarrMovieSnapshot,
  SonarrAlternateTitle,
  SonarrLookupSeries,
  SonarrSeries,
  SonarrSeriesSnapshot,
  ProviderTag,
  ProviderQualityProfile,
  ProviderRootFolder
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
  AddRequestPayload,
  CheckMovieStatusPayload,
  CheckMovieStatusResponse,
  CheckSeriesStatusPayload,
  CheckSeriesStatusResponse,
  TestConnectionPayload,
} from '@/rpc/types';

export type {
  ExtensionOptions,
  PublicOptions,
  SonarrPublicOptions,
  RadarrPublicOptions,
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

export type { Settings } from '@/shared/schemas/settings';
