import type { InferOutput } from 'valibot';
import { SettingsSchema } from '@/shared/schemas/settings';

export type {
  AniFormat,
  AniMedia,
  AniTitles,
  MediaMetadataHint,
  MediaStatus
} from './anilist';

export type {
  LeanSonarrSeries,
  SonarrAlternateTitle,
  SonarrLookupSeries,
  SonarrMonitorOption,
  SonarrQualityProfile,
  SonarrRootFolder,
  SonarrSeries,
  SonarrTag,
} from './sonarr';

export type {
  AddRequestPayload,
  CheckSeriesStatusPayload,
  CheckSeriesStatusResponse,
  ExtensionOptions,
  PublicOptions,
  TitleLanguage,
  SonarrSecrets,
  SonarrCredentialsPayload,
  SonarrFormState,
  TestConnectionPayload,
  UiOptions,
  BadgeVisibility,
} from './extension';

export { ErrorCode, type ExtensionError } from './errors';

export {
  type Candidate,
  type EvaluationOutcome,
  type EvaluationOutcomeResolved,
  type EvaluationOutcomeUnresolved,
  type MappingContext,
  type ScoredCandidate,
  type MappingOverrideRecord,
} from './mapping';

export type { RequestPriority } from './common';
export type { MediaService } from './common';

export type { MappingTargetId, MappingSearchResult } from './mapping-ui';

export {
  type BrowseAdapter,
  type CardOverlayProps,
  type ParsedCard,
} from './browse-overlay';

export type Settings = InferOutput<typeof SettingsSchema>;
