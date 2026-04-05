/** Transport-local AniList GraphQL response schemas for media queries. */
// src/anilist/transport/media-response.schema.ts

import * as v from 'valibot';
import { AniListMediaSchema } from '@/anilist/schemas/media.schema';

export const AniListGraphQLErrorSchema = v.object({
  message: v.string(),
  status: v.optional(v.number()),
});

const AniListMediaPageSchema = v.object({
  media: v.optional(v.array(AniListMediaSchema), []),
});

const AniListMediaResponseDataSchema = v.object({
  Page: v.optional(v.nullable(AniListMediaPageSchema)),
});

export const FindMediaBatchResponseDtoSchema = v.object({
  data: v.optional(v.nullable(AniListMediaResponseDataSchema)),
  errors: v.optional(v.array(AniListGraphQLErrorSchema)),
});

export type AniListGraphQLError = v.InferOutput<typeof AniListGraphQLErrorSchema>;
