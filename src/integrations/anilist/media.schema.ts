/** Transport-local AniList GraphQL response schemas for media queries. */
// src/integrations/anilist/media.schema.ts

import * as v from 'valibot';
import {
  AniListMediaFormatSchema,
  AniListMediaSchema,
  AniListMediaStatusSchema,
  AniListTitlesSchema,
} from '@/shared/schemas/anilist/anilist-media.schema';
import { AniListMetadataCoverImageSchema } from '@/shared/schemas/anilist/anilist-metadata.schema';

const AniListIdSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

export const AniListGraphQLErrorSchema = v.object({
  message: v.string(),
  status: v.optional(v.number()),
});

export const AniListSearchMediaDtoSchema = v.object({
  id: AniListIdSchema,
  title: v.optional(
    v.pipe(
      v.nullable(AniListTitlesSchema),
      v.transform(value => value ?? {}),
    ),
    {},
  ),
  coverImage: v.optional(v.nullable(AniListMetadataCoverImageSchema), null),
  format: v.optional(v.nullable(AniListMediaFormatSchema), null),
  status: v.optional(v.nullable(AniListMediaStatusSchema), null),
});

const AniListMediaPageSchema = v.object({
  media: v.optional(v.array(AniListMediaSchema), []),
});

const AniListSearchPageSchema = v.object({
  media: v.optional(v.array(AniListSearchMediaDtoSchema), []),
});

const AniListMediaResponseDataSchema = v.object({
  Page: v.optional(v.nullable(AniListMediaPageSchema)),
});

const AniListSearchResponseDataSchema = v.object({
  Page: v.optional(v.nullable(AniListSearchPageSchema)),
});

export const FindMediaBatchResponseDtoSchema = v.object({
  data: v.optional(v.nullable(AniListMediaResponseDataSchema)),
  errors: v.optional(v.array(AniListGraphQLErrorSchema)),
});

export const SearchMediaResponseDtoSchema = v.object({
  data: v.optional(v.nullable(AniListSearchResponseDataSchema)),
  errors: v.optional(v.array(AniListGraphQLErrorSchema)),
});

export type AniListGraphQLError = v.InferOutput<typeof AniListGraphQLErrorSchema>;
export type AniListSearchMediaDto = v.InferOutput<typeof AniListSearchMediaDtoSchema>;
