/** AniList metadata-hint projection helpers used by mapping resolution. */
// src/services/mapping/hints/media-hints.ts

import type {
  AniListMedia,
  AniListMediaHint,
  AniListTitles,
} from '@/shared/schemas/anilist/anilist-media.schema';

const normalizeTitles = (titles?: AniListTitles | null): AniListTitles => {
  if (!titles) return {};
  const normalized: AniListTitles = {};
  if (titles.english) normalized.english = titles.english;
  if (titles.romaji) normalized.romaji = titles.romaji;
  if (titles.native) normalized.native = titles.native;
  return normalized;
};

export function buildMediaFromMetadataHint(anilistId: number, metadata?: AniListMediaHint | null): AniListMedia | null {
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
    ? metadata.relationPrequelIds.filter(
        (value): value is number => typeof value === 'number' && Number.isFinite(value),
      )
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
          edges: relationIds.map(id => ({
            relationType: 'PREQUEL',
            node: {
              id,
              format: null,
              title: {},
              synonyms: [],
            } as AniListMedia,
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
