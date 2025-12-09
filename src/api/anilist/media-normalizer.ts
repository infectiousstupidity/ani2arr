import type { AniMedia } from '@/shared/types';
import { logger } from '@/shared/utils/logger';
import { MEDIA_HARD_TTL, MEDIA_SOFT_TTL } from './constants';
import type { TtlCache } from '@/cache';

const log = logger.create('AniListMediaCache');

export const hasCompleteMediaFields = (media: AniMedia | null | undefined): media is AniMedia => {
  if (!media) return false;
  const cover = media.coverImage;
  const hasCover =
    !!cover &&
    ((typeof cover.extraLarge === 'string' && cover.extraLarge.trim().length > 0) ||
      (typeof cover.large === 'string' && cover.large.trim().length > 0) ||
      (typeof cover.medium === 'string' && cover.medium.trim().length > 0));

  return hasCover;
};

export const normalizeMedia = (media: AniMedia): AniMedia => {
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

export const sanitizeMedia = (media: AniMedia): AniMedia => {
  try {
    return structuredClone(media) as AniMedia;
  } catch {
    return media;
  }
};

export async function cacheMedia(cache: TtlCache<AniMedia> | undefined, id: number, media: AniMedia): Promise<AniMedia> {
  const normalized = normalizeMedia(media);
  const sanitized = sanitizeMedia(normalized);
  if (!cache) return sanitized;

  try {
    await cache.write(String(id), sanitized, {
      staleMs: MEDIA_SOFT_TTL,
      hardMs: MEDIA_HARD_TTL,
      meta: { cachedAt: Date.now() },
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
