// src/shared/types/anilist.ts

export type AniFormat =
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

export type MediaStatus =
  | 'FINISHED'
  | 'RELEASING'
  | 'NOT_YET_RELEASED'
  | 'CANCELLED'
  | 'HIATUS';

export type MediaSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export interface AniTitles {
  romaji?: string | undefined;
  english?: string | undefined;
  native?: string | undefined;
}

export interface MediaMetadataHint {
  titles?: AniTitles | null | undefined;
  synonyms?: string[] | null | undefined;
  startYear?: number | null | undefined;
  format?: AniFormat | null | undefined;
  relationPrequelIds?: number[] | null | undefined;
  coverImage?: string | null | undefined;
}

export type AniMedia = {
  id: number;
  format: AniFormat | null;
  title: AniTitles;
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
  status?: MediaStatus | null;
  season?: MediaSeason | null;
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

export interface AniListMetadataImage {
  medium?: string | null;
  large?: string | null;
}

export interface AniListMetadata {
  id: number;
  titles: AniTitles;
  seasonYear?: number | null;
  format?: AniFormat | null;
  coverImage?: AniListMetadataImage | null;
  updatedAt: number;
}

export interface AniListMetadataBundle {
  generatedAt: number;
  entries: AniListMetadata[];
}

export interface AniListSearchResult {
  id: number;
  title: AniTitles;
  coverImage?: {
    large?: string | null;
    medium?: string | null;
  } | null;
  format?: AniFormat | null;
  status?: MediaStatus | null;
}
