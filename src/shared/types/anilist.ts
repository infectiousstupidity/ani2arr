/** Canonical cross-cutting AniList media, metadata, and hint types shared across app boundaries. */
// src/shared/types/anilist.ts

export type AniListMediaFormat =
  | 'TV'
  | 'TV_SHORT'
  | 'MOVIE'
  | 'SPECIAL'
  | 'OVA'
  | 'ONA'
  | 'MUSIC'
  | 'MANGA'
  | 'NOVEL'
  | 'ONE_SHOT';

export type AniListMediaStatus =
  | 'FINISHED'
  | 'RELEASING'
  | 'NOT_YET_RELEASED'
  | 'CANCELLED'
  | 'HIATUS';

export type AniListMediaSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export interface AniListTitles {
  romaji?: string | undefined;
  english?: string | undefined;
  native?: string | undefined;
}

export interface AniListMediaHint {
  titles?: AniListTitles | null | undefined;
  synonyms?: string[] | null | undefined;
  startYear?: number | null | undefined;
  format?: AniListMediaFormat | null | undefined;
  relationPrequelIds?: number[] | null | undefined;
  coverImage?: string | null | undefined;
}

export type AniListMedia = {
  id: number;
  format: AniListMediaFormat | null;
  title: AniListTitles;
  startDate?: { year?: number | null };
  synonyms: string[];
  relations?: {
    edges: {
      relationType: string;
      node: { id: number };
    }[];
  };
  
  // Images
  bannerImage?: string | null;
  coverImage?: {
    extraLarge?: string | null;
    large?: string | null;
    medium?: string | null;
    color?: string | null;
  } | null;

  // Metadata Context
  description?: string | null;
  status?: AniListMediaStatus | null;
  season?: AniListMediaSeason | null;
  seasonYear?: number | null;
  episodes?: number | null;
  duration?: number | null;
  genres?: string[] | null;
  
  nextAiringEpisode?: {
    episode: number;
    airingAt: number; // Unix timestamp (seconds)
  } | null;

  studios?: {
    nodes?: Array<{
      name?: string | null;
    }> | null;
  } | null;
};

export interface AniListMetadataCoverImage {
  medium?: string | null;
  large?: string | null;
}

export interface AniListMetadata {
  id: number;
  titles: AniListTitles;
  seasonYear?: number | null;
  format?: AniListMediaFormat | null;
  coverImage?: AniListMetadataCoverImage | null;
  updatedAt: number;
}

export interface AniListMetadataChunkRef {
  file: string;
  count: number;
}

export interface AniListMetadataBundle {
  generatedAt: number;
  entries?: AniListMetadata[];
  chunks?: AniListMetadataChunkRef[];
}
