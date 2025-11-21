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
  romaji?: string;
  english?: string;
  native?: string;
}

export interface MediaMetadataHint {
  titles?: AniTitles | null;
  synonyms?: string[] | null;
  startYear?: number | null;
  format?: AniFormat | null;
  relationPrequelIds?: number[] | null;
  coverImage?: string | null;
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