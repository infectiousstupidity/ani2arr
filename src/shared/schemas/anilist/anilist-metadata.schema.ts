/** Canonical AniList metadata schemas for persisted metadata contracts. */
// src/shared/schemas/anilist-metadata.schema.ts

import * as v from 'valibot';
import { AniListMediaFormatSchema, AniListTitlesSchema } from '@/shared/schemas/anilist/anilist-media.schema';

const AniListIdSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

export const AniListMetadataCoverImageSchema = v.object({
  medium: v.optional(v.nullable(v.string())),
  large: v.optional(v.nullable(v.string())),
});

export const AniListMetadataSchema = v.object({
  id: AniListIdSchema,
  titles: AniListTitlesSchema,
  seasonYear: v.optional(v.nullable(v.number())),
  format: v.optional(v.nullable(AniListMediaFormatSchema)),
  coverImage: v.optional(v.nullable(AniListMetadataCoverImageSchema)),
  updatedAt: v.number(),
});

export const AniListMetadataChunkRefSchema = v.object({
  file: v.pipe(v.string(), v.nonEmpty()),
  count: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const AniListMetadataBundleSchema = v.object({
  generatedAt: v.number(),
  entries: v.optional(v.array(AniListMetadataSchema)),
  chunks: v.optional(v.array(AniListMetadataChunkRefSchema)),
});

export type AniListMetadataCoverImage = v.InferOutput<typeof AniListMetadataCoverImageSchema>;
export type AniListMetadata = v.InferOutput<typeof AniListMetadataSchema>;
export type AniListMetadataChunkRef = v.InferOutput<typeof AniListMetadataChunkRefSchema>;
export type AniListMetadataBundle = v.InferOutput<typeof AniListMetadataBundleSchema>;
