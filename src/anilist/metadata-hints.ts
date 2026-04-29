/** Shared AniList metadata-hint helpers for pure transforms and metadata derivation. */
// src/anilist/metadata-hints.ts

import { parseAniListMediaFormat, type AniListMediaFormat, type AniListMediaHint, type AniListTitles } from '@/anilist/schemas/media.schema';
import type { AniListMetadata } from '@/anilist/schemas/metadata.schema';

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

const coerceTitles = (value: unknown): AniListTitles | null => {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const titles: AniListTitles = {};
  if (typeof source.english === 'string' && source.english.trim()) {
    titles.english = source.english.trim();
  }
  if (typeof source.romaji === 'string' && source.romaji.trim()) {
    titles.romaji = source.romaji.trim();
  }
  if (typeof source.native === 'string' && source.native.trim()) {
    titles.native = source.native.trim();
  }
  return Object.keys(titles).length > 0 ? titles : null;
};

const coerceSynonyms = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const normalized = normalizeSynonyms(
    value
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim()),
  );
  return normalized.length > 0 ? normalized : null;
};

const coerceFormat = (value: unknown): AniListMediaFormat | null => {
  return parseAniListMediaFormat(value);
};

const coerceStartYear = (value: unknown): number | null => {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const year = source.year;
  if (typeof year === 'number' && Number.isFinite(year)) return year;
  if (typeof year === 'string') {
    const parsed = Number.parseInt(year, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const coerceRelationPrequelIds = (value: unknown): number[] | null => {
  if (!value || typeof value !== 'object') return null;
  const edges = (value as { edges?: unknown }).edges;
  if (!Array.isArray(edges)) return null;
  const ids: number[] = [];

  for (const edge of edges) {
    if (!edge || typeof edge !== 'object') continue;
    const edgeObj = edge as Record<string, unknown>;
    if (edgeObj.relationType !== 'PREQUEL') continue;
    const node = edgeObj.node;
    if (!node || typeof node !== 'object') continue;
    const nodeId = (node as Record<string, unknown>).id;
    let parsed: number | null = null;
    if (typeof nodeId === 'number') {
      parsed = nodeId;
    } else if (typeof nodeId === 'string') {
      const num = Number.parseInt(nodeId, 10);
      if (Number.isFinite(num)) {
        parsed = num;
      }
    }
    if (parsed !== null && Number.isFinite(parsed)) {
      ids.push(parsed);
    }
  }

  const normalized = normalizeRelationIds(ids);
  return normalized.length > 0 ? normalized : null;
};

const metadataFromAny = (value: unknown): AniListMediaHint | null => {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const titles = coerceTitles(source.title);
  const synonyms = coerceSynonyms(source.synonyms);
  const startYear = coerceStartYear(source.startDate ?? source.start_date);
  const format = coerceFormat(source.format);
  const prequelIds = coerceRelationPrequelIds(source.relations);

  if (!titles && !synonyms && startYear == null && !format && !prequelIds) {
    return null;
  }

  return {
    titles: titles ?? null,
    synonyms: synonyms ?? null,
    startYear: startYear ?? null,
    format: format ?? null,
    relationPrequelIds: prequelIds ?? null,
  } satisfies AniListMediaHint;
};

export const metadataFromMediaObject = (value: unknown): AniListMediaHint | null => metadataFromAny(value);
