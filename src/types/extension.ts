import type { MediaMetadataHint } from './anilist';
import type {
  LeanSonarrSeries,
  SonarrMonitorOption,
} from './sonarr';

export interface SonarrFormState {
  qualityProfileId: number | '';
  rootFolderPath: string;
  seriesType: 'standard' | 'anime' | 'daily';
  monitorOption: SonarrMonitorOption;
  seasonFolder: boolean;
  searchForMissingEpisodes: boolean;
  tags: number[];
}

export interface ExtensionOptions {
  sonarrUrl: string;
  sonarrApiKey: string;
  defaults: SonarrFormState;
}

export interface AddRequestPayload extends Partial<SonarrFormState> {
  title: string;
  anilistId: number;
  tvdbId?: number;
  metadata?: MediaMetadataHint | null;
}

export interface CheckSeriesStatusPayload {
  anilistId: number;
  title?: string;
  metadata?: MediaMetadataHint | null;
}

export interface CheckSeriesStatusResponse {
  exists: boolean;
  tvdbId: number | null;
  successfulSynonym?: string;
  anilistTvdbLinkMissing?: boolean;
  series?: LeanSonarrSeries;
}

export interface SonarrCredentialsPayload {
  url: string;
  apiKey: string;
}

export type TestConnectionPayload = SonarrCredentialsPayload;
