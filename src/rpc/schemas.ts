// src/rpc/schemas.ts
import * as v from 'valibot';
import type { CheckSeriesStatusResponse, SonarrLookupSeries } from '@/shared/types';

// ============================================================================
// Shared / Reusable Validators
// ============================================================================

/**
 * Standard positive integer ID (used for AniList, TVDB, IDs, etc.)
 */
const IdSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

/**
 * Standard non-empty string validation
 */
const createRequiredStringSchema = (msg: string = 'Value cannot be empty') =>
  v.pipe(v.string(), v.nonEmpty(msg));

// ============================================================================
// Component Schemas
// ============================================================================

const RequestPrioritySchema = v.picklist(['high', 'normal', 'low']);

const AniTitlesSchema = v.object({
  romaji: v.optional(v.string()),
  english: v.optional(v.string()),
  native: v.optional(v.string()),
});

const AniFormatSchema = v.picklist([
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
]);

const MediaMetadataHintSchema = v.object({
  titles: v.optional(AniTitlesSchema),
  synonyms: v.optional(v.array(v.string())),
  startYear: v.optional(v.number()),
  format: v.optional(AniFormatSchema),
  relationPrequelIds: v.optional(v.array(v.number())),
  coverImage: v.optional(v.string()),
});

const SonarrMonitorOptionSchema = v.picklist([
  'all',
  'future',
  'missing',
  'existing',
  'firstSeason',
  'lastSeason',
  'pilot',
  'recent',
  'monitorSpecials',
  'unmonitorSpecials',
  'none',
]);

const SonarrFormStateSchema = v.object({
  qualityProfileId: v.union([v.number(), v.literal('')]),
  rootFolderPath: v.string(),
  seriesType: v.picklist(['standard', 'anime', 'daily']),
  monitorOption: SonarrMonitorOptionSchema,
  seasonFolder: v.boolean(),
  searchForMissingEpisodes: v.boolean(),
  searchForCutoffUnmet: v.boolean(),
  tags: v.array(v.number()),
  freeformTags: v.array(v.string()),
});

const SonarrCredentialsSchema = v.object({
  url: createRequiredStringSchema('URL cannot be empty'),
  apiKey: createRequiredStringSchema('API key cannot be empty'),
});

// ============================================================================
// RPC Input Schemas
// ============================================================================

export const ResolveInputSchema = v.object({
  anilistId: IdSchema,
  primaryTitleHint: v.optional(v.string()),
  metadata: v.optional(MediaMetadataHintSchema),
});

export const StatusInputSchema = v.object({
  anilistId: IdSchema,
  title: v.optional(v.string()),
  force_verify: v.optional(v.boolean()),
  network: v.optional(v.literal('never')),
  ignoreFailureCache: v.optional(v.boolean()),
  metadata: v.optional(MediaMetadataHintSchema),
  priority: v.optional(RequestPrioritySchema),
});

export const AddInputSchema = v.object({
  anilistId: IdSchema,
  title: createRequiredStringSchema('Title cannot be empty'),
  primaryTitleHint: v.optional(v.string()),
  metadata: v.optional(MediaMetadataHintSchema),
  form: SonarrFormStateSchema,
});

export const UpdateSonarrInputSchema = v.object({
  anilistId: IdSchema,
  tvdbId: IdSchema,
  title: createRequiredStringSchema('Title cannot be empty'),
  form: SonarrFormStateSchema,
});

export const SetMappingOverrideInputSchema = v.object({
  anilistId: IdSchema,
  tvdbId: IdSchema,
  force: v.optional(v.boolean()),
});

export const ClearMappingOverrideInputSchema = v.object({
  anilistId: IdSchema,
});

export const SonarrLookupInputSchema = v.object({
  term: createRequiredStringSchema('Search term cannot be empty'),
  priority: v.optional(RequestPrioritySchema),
  force_network: v.optional(v.boolean()),
});

export const ValidateTvdbInputSchema = v.object({
  tvdbId: IdSchema,
});

// Array inputs
export const PrefetchAniListMediaInputSchema = v.array(IdSchema);
export const GetStaticMappedInputSchema = v.array(IdSchema);

// Single ID inputs
export const FetchAniListMediaInputSchema = IdSchema;

export const TestConnectionInputSchema = SonarrCredentialsSchema;

export const GetSonarrMetadataInputSchema = v.optional(
  v.object({
    credentials: v.optional(SonarrCredentialsSchema),
  }),
);

// ============================================================================
// TypeScript types inferred from schemas
// ============================================================================

export type ResolveInput = v.InferOutput<typeof ResolveInputSchema>;
export type StatusInput = v.InferOutput<typeof StatusInputSchema>;
export type AddInput = v.InferOutput<typeof AddInputSchema>;
export type UpdateSonarrInput = v.InferOutput<typeof UpdateSonarrInputSchema>;
export type SetMappingOverrideInput = v.InferOutput<typeof SetMappingOverrideInputSchema>;
export type ClearMappingOverrideInput = v.InferOutput<typeof ClearMappingOverrideInputSchema>;
export type SonarrLookupInput = v.InferOutput<typeof SonarrLookupInputSchema>;
export type ValidateTvdbInput = v.InferOutput<typeof ValidateTvdbInputSchema>;

// ============================================================================
// Output types
// ============================================================================

export interface MappingOutput {
  tvdbId: number | null;
  successfulSynonym?: string;
}

export type StatusOutput = CheckSeriesStatusResponse;

export interface MappingOverrideItem {
  anilistId: number;
  tvdbId: number;
  updatedAt: number;
}

export interface SonarrLookupOutput {
  results: SonarrLookupSeries[];
  libraryTvdbIds: number[];
  linkedAniListIdsByTvdbId?: Record<number, number[]>;
  statsMap?: Record<
    number,
    {
      seasonCount?: number;
      episodeCount?: number;
      episodeFileCount?: number;
      totalEpisodeCount?: number;
      sizeOnDisk?: number;
      percentOfEpisodes?: number;
    }
  >;
}

export interface ValidateTvdbOutput {
  inLibrary: boolean;
  inCatalog: boolean;
}
