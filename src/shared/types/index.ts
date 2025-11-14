export type {
  AniFormat,
  AniMedia,
  AniTitles,
  MediaMetadataHint,
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
  SonarrSecrets,
  SonarrCredentialsPayload,
  SonarrFormState,
  TestConnectionPayload,
} from './extension';

export { ErrorCode, type ExtensionError } from './errors';

export {
  type Candidate,
  type EvaluationOutcome,
  type EvaluationOutcomeResolved,
  type EvaluationOutcomeUnresolved,
  type MappingContext,
  type ScoredCandidate,
} from './mapping';

export type { RequestPriority } from './common';
export type { MediaService } from './common';

export type { MappingTargetId, MappingSearchResult } from './mapping-ui';

export {
  type BrowseAdapter,
  type CardOverlayProps,
  type ModalState,
  type ParsedCard,
} from './browse-overlay';
