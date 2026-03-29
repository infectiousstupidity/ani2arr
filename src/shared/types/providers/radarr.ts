/** Canonical shared Radarr provider resource types reused unchanged across integrations, RPC, and UI flows. */
// src/shared/types/providers/radarr.ts

import type { RadarrMinimumAvailability } from '@/shared/schemas/radarr-settings.schema';

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

export interface RadarrMovieSnapshot {
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
