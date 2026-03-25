export type {
  AniFormat,
  AniMedia,
  AniTitles,
  MediaMetadataHint,
  MediaStatus,
  AniListMetadata,
  AniListMetadataChunk,
  AniListMetadataBundle,
  AniListSearchResult,
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
  LeanRadarrMovie,
  Provider,
  LeanSonarrSeries,
  RadarrAlternateTitle,
  RadarrLookupMovie,
  RadarrMinimumAvailability,
  RadarrMovie,
  RadarrQualityProfile,
  RadarrRootFolder,
  RadarrTag,
  SonarrAlternateTitle,
  SonarrLookupSeries,
  SonarrMonitorOption,
  SonarrQualityProfile,
  SonarrRootFolder,
  SonarrSeries,
  SonarrTag,
  SonarrCutoffItem,
  SonarrCutoffList,
} from './providers';

export type { ProviderCredentials, ProviderTitleLanguage } from '@/shared/types/options';

export type {
  SonarrFormState,
  SonarrPublicSettings,
  SonarrSecrets,
  SonarrSettings,
} from '@/shared/providers/sonarr/types';

export type {
  RadarrFormState,
  RadarrPublicSettings,
  RadarrSecrets,
  RadarrSettings,
} from '@/shared/providers/radarr/types';

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

export { ErrorCode, type ExtensionError } from './errors';

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
