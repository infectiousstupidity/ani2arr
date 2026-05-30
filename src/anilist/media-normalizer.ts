/** AniList media normalization and cache-write helpers for the domain workflow. */
// src/anilist/media-normalizer.ts

import type { TtlCache } from '@/shared/cache/ttl-cache';
import type { AniListId } from '@/anilist/anilist-id';
import type { AniListMedia } from '@/anilist/schemas/media.schema';
import { logger } from '@/shared/utils/logger';
import { ANILIST_MEDIA_CACHE_TTL } from './media.cache';

const log = logger.create('AniListMediaCache');

export const normalizeMedia = (media: AniListMedia): AniListMedia => {
  const cover = media.coverImage ?? null;
  return {
    ...media,
    bannerImage: media.bannerImage ?? null,
    coverImage: cover
      ? {
          extraLarge: cover.extraLarge ?? null,
          large: cover.large ?? null,
          medium: cover.medium ?? null,
          color: cover.color ?? null,
        }
      : null,
    title: media.title ?? {},
    synonyms: Array.isArray(media.synonyms) ? [...media.synonyms] : [],
  };
};

export async function cacheMedia(cache: TtlCache<AniListMedia> | undefined, id: AniListId, media: AniListMedia): Promise<AniListMedia> {
  const normalized = normalizeMedia(media);
  if (!cache) return normalized;

  try {
    await cache.write(String(id), normalized, {
      staleMs: ANILIST_MEDIA_CACHE_TTL.staleMs,
      hardMs: ANILIST_MEDIA_CACHE_TTL.hardMs,
    });
  } catch (error) {
    const name = (error as { name?: string } | null | undefined)?.name ?? '';
    if (name === 'DataCloneError') {
      log.warn(`cache:media DataCloneError id=${id}; skipping cache write`);
      return normalized;
    }
    throw error;
  }

  return normalized;
}
