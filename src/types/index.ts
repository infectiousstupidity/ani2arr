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

export {
  type BrowseAdapter,
  type CardOverlayProps,
  type ModalState,
  type ParsedCard,
} from './browse-overlay';
