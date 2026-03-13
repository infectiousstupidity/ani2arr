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
} from './anilist-debug';

export type {
  LeanRadarrMovie,
  MediaService,
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

export type {
  ArrCredentialsPayload,
  AddRequestPayload,
  CheckMovieStatusPayload,
  CheckMovieStatusResponse,
  CheckSeriesStatusPayload,
  CheckSeriesStatusResponse,
  ExtensionOptions,
  PublicOptions,
  ProviderPublicOptions,
  ProviderSettings,
  RadarrCredentialsPayload,
  RadarrFormState,
  RadarrSecrets,
  RadarrSettings,
  SonarrPublicSettings,
  SonarrSettings,
  TitleLanguage,
  SonarrSecrets,
  SonarrCredentialsPayload,
  SonarrFormState,
  TestConnectionPayload,
  UiOptions,
  BadgeVisibility,
} from './options';

export { ErrorCode, type ExtensionError } from './errors';

export {
  type MappingOverrideRecord,
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
