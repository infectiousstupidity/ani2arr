// src/shared/utils/media-metadata.ts
import type { MediaMetadataHint } from '@/shared/types';

export const normalizeSynonyms = (synonyms?: string[] | null): string[] => {
  if (!Array.isArray(synonyms)) return [];

  return Array.from(
    new Set(
      synonyms
        .filter((value): value is string => typeof value === 'string')
        .map(value => value.trim())
        .filter(value => value.length > 0),
    ),
  ).sort();
};

export const normalizeRelationIds = (ids?: number[] | null): number[] => {
  if (!Array.isArray(ids)) return [];

  return Array.from(
    new Set(
      ids.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
    ),
  ).sort((a, b) => a - b);
};

export const metadataEqual = (a?: MediaMetadataHint | null, b?: MediaMetadataHint | null): boolean => {
  if (a === b) return true;
  if (!a || !b) return !a && !b;

  const titlesEqual = (key: keyof NonNullable<MediaMetadataHint['titles']>) => {
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
  return Array.from(new Set(merged));
};

const mergeRelationIds = (a: number[] | null | undefined, b: number[] | null | undefined): number[] | null => {
  const merged = [
    ...(Array.isArray(a) ? a : []),
    ...(Array.isArray(b) ? b : []),
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (merged.length === 0) return null;
  return Array.from(new Set(merged));
};

export const mergeMetadataHints = (
  primary?: MediaMetadataHint | null,
  secondary?: MediaMetadataHint | null,
): MediaMetadataHint | null => {
  const hints = [primary ?? null, secondary ?? null].filter((hint): hint is MediaMetadataHint => !!hint);
  if (hints.length === 0) return null;

  return hints.reduce<MediaMetadataHint>((acc, hint) => {
    if (!acc.titles && hint.titles) {
      acc.titles = hint.titles;
    }
    if (!acc.startYear && hint.startYear) {
      acc.startYear = hint.startYear;
    }
    if (!acc.format && hint.format) {
      acc.format = hint.format;
    }
    if (!acc.coverImage && hint.coverImage) {
      acc.coverImage = hint.coverImage;
    }

    acc.synonyms = mergeSynonyms(acc.synonyms, hint.synonyms);
    acc.relationPrequelIds = mergeRelationIds(acc.relationPrequelIds, hint.relationPrequelIds);

    return acc;
  }, {
    titles: null,
    synonyms: null,
    startYear: null,
    format: null,
    relationPrequelIds: null,
    coverImage: null,
  });
};
