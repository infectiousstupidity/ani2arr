/** Transport-local AniList GraphQL response schemas for media queries. */
// src/anilist/transport/media-response.schema.ts

import * as v from 'valibot';

export const AniListGraphQLErrorSchema = v.object({
  message: v.string(),
  status: v.optional(v.number()),
});

export const FindMediaBatchTitleDtoSchema = v.object({
  romaji: v.optional(v.nullable(v.string())),
  english: v.optional(v.nullable(v.string())),
  native: v.optional(v.nullable(v.string())),
});

const FindMediaBatchStartDateDtoSchema = v.object({
  year: v.optional(v.nullable(v.number())),
});

const FindMediaBatchRelationNodeDtoSchema = v.object({
  id: v.optional(v.nullable(v.number())),
  format: v.optional(v.nullable(v.string())),
  title: v.optional(v.nullable(FindMediaBatchTitleDtoSchema)),
  startDate: v.optional(v.nullable(FindMediaBatchStartDateDtoSchema)),
  synonyms: v.optional(v.nullable(v.array(v.unknown()))),
});

const FindMediaBatchRelationEdgeDtoSchema = v.object({
  relationType: v.optional(v.nullable(v.string())),
  node: v.optional(v.nullable(FindMediaBatchRelationNodeDtoSchema)),
});

const FindMediaBatchRelationsDtoSchema = v.object({
  edges: v.optional(v.nullable(v.array(v.nullable(FindMediaBatchRelationEdgeDtoSchema)))),
});

const FindMediaBatchCoverImageDtoSchema = v.object({
  extraLarge: v.optional(v.nullable(v.string())),
  large: v.optional(v.nullable(v.string())),
  medium: v.optional(v.nullable(v.string())),
  color: v.optional(v.nullable(v.string())),
});

const FindMediaBatchNextAiringEpisodeDtoSchema = v.object({
  episode: v.optional(v.nullable(v.number())),
  airingAt: v.optional(v.nullable(v.number())),
});

const FindMediaBatchStudioNodeDtoSchema = v.object({
  name: v.optional(v.nullable(v.string())),
});

const FindMediaBatchStudiosDtoSchema = v.object({
  nodes: v.optional(v.nullable(v.array(v.nullable(FindMediaBatchStudioNodeDtoSchema)))),
});

export const FindMediaBatchMediaDtoSchema = v.object({
  id: v.optional(v.nullable(v.number())),
  format: v.optional(v.nullable(v.string())),
  title: v.optional(v.nullable(FindMediaBatchTitleDtoSchema)),
  startDate: v.optional(v.nullable(FindMediaBatchStartDateDtoSchema)),
  synonyms: v.optional(v.nullable(v.array(v.unknown()))),
  relations: v.optional(v.nullable(FindMediaBatchRelationsDtoSchema)),
  bannerImage: v.optional(v.nullable(v.string())),
  coverImage: v.optional(v.nullable(FindMediaBatchCoverImageDtoSchema)),
  description: v.optional(v.nullable(v.string())),
  status: v.optional(v.nullable(v.string())),
  season: v.optional(v.nullable(v.string())),
  seasonYear: v.optional(v.nullable(v.number())),
  episodes: v.optional(v.nullable(v.number())),
  duration: v.optional(v.nullable(v.number())),
  genres: v.optional(v.nullable(v.array(v.unknown()))),
  nextAiringEpisode: v.optional(v.nullable(FindMediaBatchNextAiringEpisodeDtoSchema)),
  studios: v.optional(v.nullable(FindMediaBatchStudiosDtoSchema)),
});

const AniListMediaPageSchema = v.object({
  media: v.optional(v.array(v.unknown()), []),
});

const AniListMediaResponseDataSchema = v.object({
  Page: v.optional(v.nullable(AniListMediaPageSchema)),
});

export const FindMediaBatchResponseDtoSchema = v.object({
  data: v.optional(v.nullable(AniListMediaResponseDataSchema)),
  errors: v.optional(v.array(AniListGraphQLErrorSchema)),
});

export type AniListGraphQLError = v.InferOutput<typeof AniListGraphQLErrorSchema>;
export type FindMediaBatchMediaDto = v.InferOutput<typeof FindMediaBatchMediaDtoSchema>;
