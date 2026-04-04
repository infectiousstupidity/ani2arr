/** Shared AniList metadata-hint helpers used by DOM and UI call sites. */
// src/shared/anilist/media-metadata.ts

import type {
  AniListMediaHint,
} from '@/shared/schemas/anilist/anilist-media.schema';
import type { AniListMetadata } from '@/shared/schemas/anilist/anilist-metadata.schema';

export const normalizeSynonyms = (synonyms?: string[] | null): string[] => {
  if (!Array.isArray(synonyms)) return [];

  return [...new Set(
      synonyms
        .filter((value): value is string => typeof value === 'string')
        .map(value => value.trim())
        .filter(value => value.length > 0),
    )].toSorted();
};

export const normalizeRelationIds = (ids?: number[] | null): number[] => {
  if (!Array.isArray(ids)) return [];

  return [...new Set(
      ids.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
    )].toSorted((a, b) => a - b);
};

export const metadataEqual = (a?: AniListMediaHint | null, b?: AniListMediaHint | null): boolean => {
  if (a === b) return true;
  if (!a || !b) return !a && !b;

  const titlesEqual = (key: keyof NonNullable<AniListMediaHint['titles']>) => {
    const aTitle = a.titles?.[key] ?? null;
    const bTitle = b.titles?.[key] ?? null;
    return aTitle === bTitle;
  };

  const titlesMatch = titlesEqual('english') && titlesEqual('romaji') && titlesEqual('native');
  const synonymsMatch = JSON.stringify(normalizeSynonyms(a.synonyms)) === JSON.stringify(normalizeSynonyms(b.synonyms));
  const startYearMatch = (a.startYear ?? null) === (b.startYear ?? null);
  const formatMatch = (a.format ?? null) === (b.format ?? null);
  const prequelMatch = JSON.stringify(normalizeRelationIds(a.relationPrequelIds)) === JSON.stringify(normalizeRelationIds(b.relationPrequelIds));

  return titlesMatch && synonymsMatch && startYearMatch && formatMatch && prequelMatch;
};

const mergeSynonyms = (a: string[] | null | undefined, b: string[] | null | undefined): string[] | null => {
  const merged = [
    ...(Array.isArray(a) ? a : []),
    ...(Array.isArray(b) ? b : []),
  ]
    .map(item => item.trim())
    .filter(item => item.length > 0);

  if (merged.length === 0) return null;
  return [...new Set(merged)];
};

const mergeRelationIds = (a: number[] | null | undefined, b: number[] | null | undefined): number[] | null => {
  const merged = [
    ...(Array.isArray(a) ? a : []),
    ...(Array.isArray(b) ? b : []),
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (merged.length === 0) return null;
  return [...new Set(merged)];
};

export const mergeMetadataHints = (
  primary?: AniListMediaHint | null,
  secondary?: AniListMediaHint | null,
): AniListMediaHint | null => {
  const hints = [primary ?? null, secondary ?? null].filter((hint): hint is AniListMediaHint => !!hint);
  if (hints.length === 0) return null;

  const result: AniListMediaHint = {
    titles: null,
    synonyms: null,
    startYear: null,
    format: null,
    relationPrequelIds: null,
    coverImage: null,
  };

  for (const hint of hints) {
    if (!result.titles && hint.titles) {
      result.titles = hint.titles;
    }
    if (!result.startYear && hint.startYear) {
      result.startYear = hint.startYear;
    }
    if (!result.format && hint.format) {
      result.format = hint.format;
    }
    if (!result.coverImage && hint.coverImage) {
      result.coverImage = hint.coverImage;
    }

    result.synonyms = mergeSynonyms(result.synonyms, hint.synonyms);
    result.relationPrequelIds = mergeRelationIds(result.relationPrequelIds, hint.relationPrequelIds);
  }

  return result;
};

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
