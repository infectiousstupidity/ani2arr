import type { ProviderCredentials, TitleLanguage } from '@/shared/providers/common/types';

export type RadarrMinimumAvailability =
  | 'announced'
  | 'inCinemas'
  | 'released'
  | 'preDB';

export interface RadarrRootFolder {
  freeSpace: number;
  id: number;
  path: string;
}

export interface RadarrQualityProfile {
  id: number;
  name: string;
}

export interface RadarrTag {
  id: number;
  label: string;
}

export interface RadarrAlternateTitle {
  title?: string | null;
  sourceType?: string | null;
  movieMetadataId?: number | null;
}

export interface RadarrMovie {
  id: number;
  title: string;
  tmdbId: number;
  imdbId?: string | null;
  titleSlug?: string;
  sortTitle?: string;
  originalTitle?: string;
  alternateTitles?: RadarrAlternateTitle[];
  monitored?: boolean;
  year?: number;
  runtime?: number;
  status?: string;
  overview?: string;
  genres?: string[];
  path?: string;
  rootFolderPath?: string;
  folderName?: string;
  qualityProfileId?: number;
  minimumAvailability?: RadarrMinimumAvailability;
  tags?: number[];
  hasFile?: boolean;
  movieFileId?: number;
  sizeOnDisk?: number;
  added?: string;
  inCinemas?: string | null;
  digitalRelease?: string | null;
  physicalRelease?: string | null;
  images?: Array<{ coverType?: string; url?: string | null; remoteUrl?: string | null }>;
  movieFile?: {
    id?: number;
    path?: string;
    relativePath?: string;
    size?: number;
    quality?: unknown;
  };
  addOptions?: {
    searchForMovie?: boolean;
  };
}

export interface RadarrLookupMovie {
  title: string;
  tmdbId: number;
  imdbId?: string | null;
  titleSlug?: string;
  sortTitle?: string;
  originalTitle?: string;
  year?: number;
  runtime?: number;
  status?: string;
  overview?: string;
  genres?: string[];
  monitored?: boolean;
  minimumAvailability?: RadarrMinimumAvailability;
  images?: Array<{ coverType?: string; url?: string | null; remoteUrl?: string | null }>;
  alternateTitles?: RadarrAlternateTitle[];
  folderName?: string;
  remotePoster?: string | null;
  hasFile?: boolean;
  id?: number;
}

export interface LeanRadarrMovie {
  tmdbId: number;
  id: number;
  title: string;
  titleSlug?: string;
  sortTitle?: string;
  originalTitle?: string;
  folderName?: string;
  imdbId?: string | null;
  year?: number;
  alternateTitles?: string[];
  monitored?: boolean;
  minimumAvailability?: RadarrMinimumAvailability;
  hasFile?: boolean;
  sizeOnDisk?: number;
  status?: string;
}

export interface RadarrFormState {
  qualityProfileId: number | '';
  rootFolderPath: string;
  monitored: boolean;
  searchForMovie: boolean;
  minimumAvailability: RadarrMinimumAvailability;
  tags: number[];
  freeformTags: string[];
}

export interface RadarrSettings {
  url: string;
  apiKey: string;
  titleLanguage: TitleLanguage;
  defaults: RadarrFormState;
}

export interface RadarrPublicSettings {
  url: string;
  titleLanguage: TitleLanguage;
  defaults: RadarrFormState;
  isConfigured: boolean;
}

export interface RadarrSecrets {
  apiKey: string;
}

export type RadarrCredentialsPayload = ProviderCredentials;
