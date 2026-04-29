/** Canonical AniList media schemas for shared contracts parsed from AniList responses. */
// src/anilist/schemas/media.schema.ts

import * as v from 'valibot';
import { AniListIdSchema } from '@/anilist/anilist-id';

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

export const ANILIST_MEDIA_STATUSES = [
  'FINISHED',
  'RELEASING',
  'NOT_YET_RELEASED',
  'CANCELLED',
  'HIATUS',
] as const;

export const ANILIST_MEDIA_SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const;

export const AniListMediaFormatSchema = v.picklist(ANILIST_MEDIA_FORMATS);
export const AniListMediaStatusSchema = v.picklist(ANILIST_MEDIA_STATUSES);
export const AniListMediaSeasonSchema = v.picklist(ANILIST_MEDIA_SEASONS);

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

const AniListMediaStartDateSchema = v.object({
  year: v.optional(v.nullable(v.number())),
});

const AniListMediaRelationNodeSchema = v.object({
  id: AniListIdSchema,
});

const AniListMediaRelationEdgeSchema = v.object({
  relationType: v.string(),
  node: AniListMediaRelationNodeSchema,
});

const AniListMediaRelationsSchema = v.object({
  edges: v.array(AniListMediaRelationEdgeSchema),
});

const AniListMediaCoverImageSchema = v.object({
  extraLarge: v.optional(v.nullable(v.string())),
  large: v.optional(v.nullable(v.string())),
  medium: v.optional(v.nullable(v.string())),
  color: v.optional(v.nullable(v.string())),
});

const AniListMediaNextAiringEpisodeSchema = v.object({
  episode: v.number(),
  airingAt: v.number(),
});

const AniListMediaStudioNodeSchema = v.object({
  name: v.optional(v.nullable(v.string())),
});

const AniListMediaStudiosSchema = v.object({
  nodes: v.optional(v.nullable(v.array(AniListMediaStudioNodeSchema))),
});

const NormalizedAniListTitlesSchema = v.optional(
  v.pipe(
    v.nullable(AniListTitlesSchema),
    v.transform(value => value ?? {}),
  ),
  {},
);

const NormalizedStringArraySchema = v.optional(
  v.pipe(
    v.nullable(v.array(v.string())),
    v.transform(value => value ?? []),
  ),
  [],
);

const OptionalStartDateSchema = v.optional(
  v.pipe(
    v.nullable(AniListMediaStartDateSchema),
    v.transform(value => value ?? undefined),
  ),
);

const OptionalRelationsSchema = v.optional(
  v.pipe(
    v.nullable(AniListMediaRelationsSchema),
    v.transform(value => value ?? undefined),
  ),
);

export const AniListMediaSchema = v.object({
  id: AniListIdSchema,
  format: v.optional(v.nullable(AniListMediaFormatSchema), null),
  title: NormalizedAniListTitlesSchema,
  startDate: OptionalStartDateSchema,
  synonyms: NormalizedStringArraySchema,
  relations: OptionalRelationsSchema,
  bannerImage: v.optional(v.nullable(v.string())),
  coverImage: v.optional(v.nullable(AniListMediaCoverImageSchema)),
  description: v.optional(v.nullable(v.string())),
  status: v.optional(v.nullable(AniListMediaStatusSchema)),
  season: v.optional(v.nullable(AniListMediaSeasonSchema)),
  seasonYear: v.optional(v.nullable(v.number())),
  episodes: v.optional(v.nullable(v.number())),
  duration: v.optional(v.nullable(v.number())),
  genres: v.optional(v.nullable(v.array(v.string()))),
  nextAiringEpisode: v.optional(v.nullable(AniListMediaNextAiringEpisodeSchema)),
  studios: v.optional(v.nullable(AniListMediaStudiosSchema)),
});

export type AniListMediaFormat = v.InferOutput<typeof AniListMediaFormatSchema>;
export type AniListMediaStatus = v.InferOutput<typeof AniListMediaStatusSchema>;
export type AniListTitles = v.InferOutput<typeof AniListTitlesSchema>;
export type AniListMediaHint = v.InferOutput<typeof AniListMediaHintSchema>;
export type AniListMedia = v.InferOutput<typeof AniListMediaSchema>;
