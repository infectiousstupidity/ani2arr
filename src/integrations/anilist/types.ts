/** Transport-local AniList response metadata and endpoint payload wrappers. */
// src/integrations/anilist/types.ts

import type {
  AniListMediaFormat,
  AniListMetadataCoverImage,
  AniListMedia,
  AniListTitles,
  AniListMediaSeason,
  AniListMediaStatus,
} from '@/shared/types/anilist';

export interface AniListGraphQLError {
  message: string;
  status?: number;
}

export interface AniListRateLimitMeta {
  limit: number | null;
  remaining: number | null;
  resetAt: number | null;
  retryAfterMs: number | null;
}

export interface AniListResponseMeta {
  status: number;
  headers: Record<string, string>;
  rateLimit: AniListRateLimitMeta;
  receivedAt: number;
}

export interface AniListMediaDto {
  id: number;
  format?: AniListMediaFormat | null;
  title?: AniListTitles | null;
  startDate?: AniListMedia['startDate'] | null;
  synonyms?: string[] | null;
  description?: string | null;
  episodes?: number | null;
  duration?: number | null;
  nextAiringEpisode?: AniListMedia['nextAiringEpisode'] | null;
  relations?: AniListMedia['relations'] | null;
  bannerImage?: string | null;
  coverImage?: AniListMedia['coverImage'];
  status?: AniListMediaStatus | null;
  season?: AniListMediaSeason | null;
  seasonYear?: number | null;
  genres?: string[] | null;
  studios?: AniListMedia['studios'] | null;
}

export interface AniListSearchMediaDto {
  id: number;
  title?: AniListTitles | null;
  coverImage?: AniListMetadataCoverImage | null;
  format?: AniListMediaFormat | null;
  status?: AniListMediaStatus | null;
}

export interface AniListMediaPage {
  media?: AniListMediaDto[] | null;
}

export interface AniListSearchPage {
  media?: AniListSearchMediaDto[] | null;
}
