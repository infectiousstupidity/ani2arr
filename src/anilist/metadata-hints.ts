/** Shared AniList metadata-hint helpers for pure production transforms. */
// src/anilist/metadata-hints.ts

import type { AniListMediaHint } from '@/anilist/schemas/media.schema';
import type { AniListMetadata } from '@/anilist/schemas/metadata.schema';

export const metadataHintFromAniListMetadata = (
  metadata?: AniListMetadata | null,
): AniListMediaHint | null => {
  if (!metadata) return null;

  const titles = metadata.titles && Object.keys(metadata.titles).length > 0 ? metadata.titles : null;
  const coverImage = metadata.coverImage?.large ?? metadata.coverImage?.medium ?? null;

  if (!titles && metadata.seasonYear == null && metadata.format == null && !coverImage) {
    return null;
  }

  return {
    titles,
    synonyms: null,
    startYear: metadata.seasonYear ?? null,
    format: metadata.format ?? null,
    relationPrequelIds: null,
    coverImage,
  };
};
