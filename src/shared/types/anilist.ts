/** Canonical cross-cutting AniList media, metadata, and hint types shared across app boundaries. */
// src/shared/types/anilist.ts

import type { InferOutput } from 'valibot';
import type {
  AniListMediaFormatSchema,
  AniListMediaSchema,
  AniListMediaSeasonSchema,
  AniListMediaStatusSchema,
  AniListTitlesSchema,
} from '@/shared/schemas/anilist-media.schema';
import type {
  AniListMetadataBundleSchema,
  AniListMetadataChunkRefSchema,
  AniListMetadataCoverImageSchema,
  AniListMetadataSchema,
} from '@/shared/schemas/anilist-metadata.schema';

export type AniListMediaFormat = InferOutput<typeof AniListMediaFormatSchema>;
export type AniListMediaStatus = InferOutput<typeof AniListMediaStatusSchema>;
export type AniListMediaSeason = InferOutput<typeof AniListMediaSeasonSchema>;
export type AniListTitles = InferOutput<typeof AniListTitlesSchema>;

export interface AniListMediaHint {
  titles?: AniListTitles | null | undefined;
  synonyms?: string[] | null | undefined;
  startYear?: number | null | undefined;
  format?: AniListMediaFormat | null | undefined;
  relationPrequelIds?: number[] | null | undefined;
  coverImage?: string | null | undefined;
}

export type AniListMedia = InferOutput<typeof AniListMediaSchema>;
export type AniListMetadataCoverImage = InferOutput<typeof AniListMetadataCoverImageSchema>;
export type AniListMetadata = InferOutput<typeof AniListMetadataSchema>;
export type AniListMetadataChunkRef = InferOutput<typeof AniListMetadataChunkRefSchema>;
export type AniListMetadataBundle = InferOutput<typeof AniListMetadataBundleSchema>;
