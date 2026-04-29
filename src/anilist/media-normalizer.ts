/** AniList media normalization and cache-write helpers for the domain workflow. */
// src/anilist/media-normalizer.ts

import type { TtlCache } from '@/shared/cache/ttl-cache';
import type { AniListId } from '@/anilist';
import type { AniListMedia } from '@/anilist/schemas/media.schema';
import { logger } from '@/shared/utils/logger';
import { ANILIST_MEDIA_CACHE_TTL } from './media.cache';

const log = logger.create('AniListMediaCache');

export const hasCompleteMediaFields = (media: AniListMedia | null | undefined): media is AniListMedia => {
  if (!media) return false;
  const cover = media.coverImage;
  const hasCover =
    !!cover &&
    ((typeof cover.extraLarge === 'string' && cover.extraLarge.trim().length > 0) ||
      (typeof cover.large === 'string' && cover.large.trim().length > 0) ||
      (typeof cover.medium === 'string' && cover.medium.trim().length > 0));

  return hasCover;
};

export const normalizeMedia = (media: AniListMedia): AniListMedia => {
  const cover = media.coverImage ?? null;
  return {
    ...media,
    description: media.description ?? null,
    episodes: media.episodes ?? null,
    duration: media.duration ?? null,
    nextAiringEpisode: media.nextAiringEpisode ?? null,
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

export const sanitizeMedia = (media: AniListMedia): AniListMedia => {
  try {
    return structuredClone(media) as AniListMedia;
  } catch {
    return media;
  }
};

export async function cacheMedia(cache: TtlCache<AniListMedia> | undefined, id: AniListId, media: AniListMedia): Promise<AniListMedia> {
  const normalized = normalizeMedia(media);
  const sanitized = sanitizeMedia(normalized);
  if (!cache) return sanitized;

  try {
    await cache.write(String(id), sanitized, {
      staleMs: ANILIST_MEDIA_CACHE_TTL.staleMs,
      hardMs: ANILIST_MEDIA_CACHE_TTL.hardMs,
    });
  } catch (error) {
    const name = (error as { name?: string } | null | undefined)?.name ?? '';
    if (name === 'DataCloneError') {
      log.warn(`cache:media DataCloneError id=${id}; skipping cache write`);
      return sanitized;
    }
    throw error;
  }

  return sanitized;
}
