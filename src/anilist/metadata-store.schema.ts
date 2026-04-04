/** Store-local AniList metadata read schemas for baked bundles and browser storage payloads. */
// src/anilist/metadata-store.schema.ts

import * as v from 'valibot';
import { AniListMediaFormatSchema, AniListTitlesSchema } from '@/anilist/schemas/media.schema';
import { AniListMetadataCoverImageSchema } from '@/anilist/schemas/metadata.schema';

const AniListIdSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

export const RawAniListMetadataEntrySchema = v.object({
  id: v.optional(AniListIdSchema),
  titles: v.optional(v.nullable(AniListTitlesSchema)),
  seasonYear: v.optional(v.nullable(v.number())),
  format: v.optional(v.nullable(AniListMediaFormatSchema)),
  coverImage: v.optional(v.nullable(AniListMetadataCoverImageSchema)),
  updatedAt: v.optional(v.nullable(v.number())),
});

export const RawAniListMetadataBundleSchema = v.object({
  generatedAt: v.fallback(v.number(), () => Date.now()),
  entries: v.optional(v.array(v.unknown()), []),
  chunks: v.optional(v.array(v.unknown()), []),
});

export const RawAniListMetadataRecordSchema = v.record(v.string(), v.unknown());
