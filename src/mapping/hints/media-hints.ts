/** AniList metadata-hint projection helpers used by mapping resolution. */
// src/mapping/hints/media-hints.ts

import { parseAniListIdOrNull, type AniListId } from '@/anilist';
import type {
  AniListMedia,
  AniListMediaHint,
  AniListTitles,
} from '@/anilist/schemas/media.schema';

const normalizeTitles = (titles?: AniListTitles | null): AniListTitles => {
  if (!titles) return {};
  const normalized: AniListTitles = {};
  if (titles.english) normalized.english = titles.english;
  if (titles.romaji) normalized.romaji = titles.romaji;
  if (titles.native) normalized.native = titles.native;
  return normalized;
};

export function buildMediaFromMetadataHint(anilistId: AniListId, metadata?: AniListMediaHint | null): AniListMedia | null {
  if (!metadata) return null;

  const titles = normalizeTitles(metadata.titles ?? {});

  const synonyms = Array.isArray(metadata.synonyms)
    ? [...new Set(
        metadata.synonyms
          .filter((value): value is string => typeof value === 'string')
          .map(value => value.trim())
          .filter(value => value.length > 0),
      )]
    : [];

  const startYear =
    typeof metadata.startYear === 'number' && Number.isFinite(metadata.startYear)
      ? metadata.startYear
      : null;

  const format = metadata.format ?? null;

  const relationIds = Array.isArray(metadata.relationPrequelIds)
    ? metadata.relationPrequelIds
        .map((value) => parseAniListIdOrNull(value))
        .filter((value): value is AniListId => value !== null)
    : [];

  if (
    Object.keys(titles).length === 0 &&
    synonyms.length === 0 &&
    startYear == null &&
    !format &&
    relationIds.length === 0
  ) {
    return null;
  }

  const relations =
    relationIds.length > 0
      ? {
          edges: relationIds.map(anilistId => ({
            relationType: 'PREQUEL',
            node: {
              id: anilistId,
              format: null,
              title: {},
              synonyms: [],
            },
          })),
        }
      : undefined;

  const startDate = startYear == null ? undefined : { year: startYear };

  return {
    id: anilistId,
    format,
    title: titles,
    ...(startDate ? { startDate } : {}),
    synonyms,
    ...(relations ? { relations } : {}),
  };
}
