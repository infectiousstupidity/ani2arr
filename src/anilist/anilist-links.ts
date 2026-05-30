/** Builds AniList site URLs used across extension UI surfaces. */
// src/anilist/anilist-links.ts

import type { AniListId } from './anilist-id';

const ANILIST_ANIME_ROOT_URL = 'https://anilist.co/anime';

export function buildAniListAnimeUrl(anilistId: AniListId): string {
  return `${ANILIST_ANIME_ROOT_URL}/${anilistId}`;
}
