/** Canonical AniList media types and parsers used by production AniList callers. */
// src/anilist/schemas/media.schema.ts

import * as v from 'valibot';
import type { AniListId } from '@/anilist/anilist-id';

export const ANILIST_MEDIA_FORMATS = [
  'TV',
  'TV_SHORT',
  'MOVIE',
  'SPECIAL',
  'OVA',
  'ONA',
  'MUSIC',
  'MANGA',
  'NOVEL',
  'ONE_SHOT',
] as const;

type AniListMediaFormatValue = (typeof ANILIST_MEDIA_FORMATS)[number];

const ANILIST_MEDIA_FORMAT_SET = new Set<string>(ANILIST_MEDIA_FORMATS);

export const isAniListMediaFormat = (value: unknown): value is AniListMediaFormatValue => (
  typeof value === 'string' && ANILIST_MEDIA_FORMAT_SET.has(value)
);

export const parseAniListMediaFormat = (value: unknown): AniListMediaFormatValue | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return isAniListMediaFormat(normalized) ? normalized : null;
};

const normalizeMediaFormatLabel = (value: string): string =>
  value
    .toLowerCase()
    .replaceAll(/\s+/g, ' ')
    .replaceAll(/\s*\/\s*/g, ' / ')
    .trim();

export const parseAniListMediaFormatLabel = (label: string | null | undefined): AniListMediaFormatValue | null => {
  const normalized = normalizeMediaFormatLabel(label ?? '');
  switch (normalized) {
    case 'tv':
    case 'tv show': {
      return 'TV';
    }
    case 'tv short':
    case 'tv shorts': {
      return 'TV_SHORT';
    }
    case 'movie':
    case 'movies': {
      return 'MOVIE';
    }
    case 'music': {
      return 'MUSIC';
    }
    case 'ova': {
      return 'OVA';
    }
    case 'ona': {
      return 'ONA';
    }
    case 'special':
    case 'specials':
    case 'ova / ona / special': {
      return 'SPECIAL';
    }
    default: {
      return null;
    }
  }
};

export const AniListMediaFormatSchema = v.picklist(ANILIST_MEDIA_FORMATS);

export const AniListTitlesSchema = v.object({
  romaji: v.optional(v.string()),
  english: v.optional(v.string()),
  native: v.optional(v.string()),
});

export const AniListMediaHintSchema = v.object({
  titles: v.optional(v.nullable(AniListTitlesSchema)),
  synonyms: v.optional(v.nullable(v.array(v.string()))),
  startYear: v.optional(v.nullable(v.number())),
  format: v.optional(v.nullable(AniListMediaFormatSchema)),
  relationPrequelIds: v.optional(v.nullable(v.array(v.number()))),
  coverImage: v.optional(v.nullable(v.string())),
});

export type AniListMediaFormat = AniListMediaFormatValue;
export type AniListTitles = v.InferOutput<typeof AniListTitlesSchema>;
export type AniListMediaHint = v.InferOutput<typeof AniListMediaHintSchema>;

export interface AniListMedia {
  id: AniListId;
  format: AniListMediaFormat | null;
  title: AniListTitles;
  startDate?: { year?: number | null | undefined };
  synonyms: string[];
  relations?: {
    edges: Array<{
      relationType: string;
      node: {
        id: AniListId;
        format?: AniListMediaFormat | null;
        title?: AniListTitles;
        startDate?: { year?: number | null | undefined };
        synonyms?: string[];
      };
    }>;
  };
  bannerImage?: string | null;
  coverImage?: {
    extraLarge?: string | null | undefined;
    large?: string | null | undefined;
    medium?: string | null | undefined;
    color?: string | null | undefined;
  } | null;
  seasonYear?: number | null;
}
