// src/rpc/schemas.ts
import * as v from 'valibot';
import type {
  AniListSchedulerDebugSnapshot,
  CheckMovieStatusResponse,
  CheckSeriesStatusResponse,
  MappingSummary,
  RadarrLookupMovie,
  RadarrMovie,
  RadarrQualityProfile,
  RadarrRootFolder,
  RadarrTag,
  SonarrLookupSeries,
} from '@/shared/types';

// ============================================================================
// Shared / Reusable Validators
// ============================================================================

/**
 * Standard positive integer ID (used for AniList, TVDB, IDs, etc.)
 */
const IdSchema = v.pipe(v.number(), v.integer(), v.minValue(1));
const MappingProviderSchema = v.picklist(['sonarr', 'radarr']);
const MappingSourceSchema = v.picklist(['manual', 'upstream', 'auto', 'ignored']);
const MappingStatusSchema = v.picklist(['unmapped', 'in-provider', 'not-in-provider']);

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

const AniListMetadataImageSchema = v.object({
  medium: v.optional(v.nullable(v.string())),
  large: v.optional(v.nullable(v.string())),
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

const AniStatusSchema = v.picklist([
  'FINISHED',
  'RELEASING',
  'NOT_YET_RELEASED',
  'CANCELLED',
  'HIATUS',
]);

const MediaMetadataHintSchema = v.object({
  titles: v.optional(v.nullable(AniTitlesSchema)),
  synonyms: v.optional(v.nullable(v.array(v.string()))),
  startYear: v.optional(v.nullable(v.number())),
  format: v.optional(v.nullable(AniFormatSchema)),
  relationPrequelIds: v.optional(v.nullable(v.array(v.number()))),
  coverImage: v.optional(v.nullable(v.string())),
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

const RadarrFormStateSchema = v.object({
  qualityProfileId: v.union([v.number(), v.literal('')]),
  rootFolderPath: v.string(),
  monitored: v.boolean(),
  searchForMovie: v.boolean(),
  minimumAvailability: v.picklist(['announced', 'inCinemas', 'released', 'preDB']),
  tags: v.array(v.number()),
  freeformTags: v.array(v.string()),
});

const ArrCredentialsSchema = v.object({
  url: createRequiredStringSchema('URL cannot be empty'),
  apiKey: createRequiredStringSchema('API key cannot be empty'),
});

const SonarrCredentialsSchema = ArrCredentialsSchema;
const RadarrCredentialsSchema = ArrCredentialsSchema;

const MappingExternalIdSchema = v.object({
  id: IdSchema,
  kind: v.picklist(['tvdb', 'tmdb']),
});

export const MappingSummarySchema = v.object({
  anilistId: IdSchema,
  provider: MappingProviderSchema,
  externalId: v.nullable(MappingExternalIdSchema),
  source: MappingSourceSchema,
  status: MappingStatusSchema,
  updatedAt: v.optional(v.number()),
  linkedAniListIds: v.optional(v.array(IdSchema)),
  inLibraryCount: v.optional(v.number()),
  providerMeta: v.optional(
    v.object({
      title: v.optional(v.string()),
      type: v.optional(v.picklist(['series', 'movie'])),
      statusLabel: v.optional(v.string()),
    }),
  ),
  hadResolveAttempt: v.optional(v.boolean()),
});

// ============================================================================
// RPC Input Schemas
// ============================================================================

export const ResolveInputSchema = v.object({
  anilistId: IdSchema,
  primaryTitleHint: v.optional(v.string()),
  metadata: v.optional(v.nullable(MediaMetadataHintSchema)),
});

export const StatusInputSchema = v.object({
  anilistId: IdSchema,
  title: v.optional(v.string()),
  force_verify: v.optional(v.boolean()),
  network: v.optional(v.literal('never')),
  ignoreFailureCache: v.optional(v.boolean()),
  metadata: v.optional(v.nullable(MediaMetadataHintSchema)),
  priority: v.optional(RequestPrioritySchema),
});

export const AddInputSchema = v.object({
  anilistId: IdSchema,
  title: createRequiredStringSchema('Title cannot be empty'),
  primaryTitleHint: v.optional(v.string()),
  metadata: v.optional(v.nullable(MediaMetadataHintSchema)),
  form: SonarrFormStateSchema,
});

export const UpdateSonarrInputSchema = v.object({
  anilistId: IdSchema,
  tvdbId: IdSchema,
  title: createRequiredStringSchema('Title cannot be empty'),
  form: SonarrFormStateSchema,
});

export const AddRadarrInputSchema = v.object({
  anilistId: IdSchema,
  title: createRequiredStringSchema('Title cannot be empty'),
  primaryTitleHint: v.optional(v.string()),
  metadata: v.optional(v.nullable(MediaMetadataHintSchema)),
  form: RadarrFormStateSchema,
});

export const UpdateRadarrInputSchema = v.object({
  anilistId: IdSchema,
  tmdbId: IdSchema,
  title: createRequiredStringSchema('Title cannot be empty'),
  form: RadarrFormStateSchema,
});

export const SetMappingOverrideInputSchema = v.object({
  anilistId: IdSchema,
  provider: MappingProviderSchema,
  externalId: MappingExternalIdSchema,
  force: v.optional(v.boolean()),
});

export const ClearMappingOverrideInputSchema = v.object({
  anilistId: IdSchema,
  provider: MappingProviderSchema,
});

export const SetMappingIgnoreInputSchema = v.object({
  anilistId: IdSchema,
  provider: MappingProviderSchema,
});

export const ClearMappingIgnoreInputSchema = v.object({
  anilistId: IdSchema,
  provider: MappingProviderSchema,
});

export const SonarrLookupInputSchema = v.object({
  term: createRequiredStringSchema('Search term cannot be empty'),
  priority: v.optional(RequestPrioritySchema),
  force_network: v.optional(v.boolean()),
});

export const ValidateTvdbInputSchema = v.object({
  tvdbId: IdSchema,
});

export const ValidateTmdbInputSchema = v.object({
  tmdbId: IdSchema,
});

// Array inputs
export const PrefetchAniListMediaInputSchema = v.array(IdSchema);
export const GetStaticMappedInputSchema = v.array(IdSchema);

// Single ID inputs
export const FetchAniListMediaInputSchema = IdSchema;

export const TestConnectionInputSchema = SonarrCredentialsSchema;
export const TestRadarrConnectionInputSchema = RadarrCredentialsSchema;

export const GetSonarrMetadataInputSchema = v.optional(
  v.object({
    credentials: v.optional(SonarrCredentialsSchema),
  }),
);

export const GetRadarrMetadataInputSchema = v.optional(
  v.object({
    credentials: v.optional(RadarrCredentialsSchema),
  }),
);

export const RadarrLookupInputSchema = v.object({
  term: createRequiredStringSchema('Search term cannot be empty'),
  priority: v.optional(RequestPrioritySchema),
  force_network: v.optional(v.boolean()),
});

const MappingCursorSchema = v.object({
  updatedAt: v.number(),
  anilistId: IdSchema,
  provider: MappingProviderSchema,
});

export const SearchAniListInputSchema = v.object({
  search: createRequiredStringSchema('Search cannot be empty'),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(25))),
});

export const GetMappingsInputSchema = v.optional(
  v.object({
    sources: v.optional(v.array(MappingSourceSchema)),
    providers: v.optional(v.array(MappingProviderSchema)),
    limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
    cursor: v.optional(MappingCursorSchema),
    query: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  }),
);

export const AniListMetadataSchema = v.object({
  id: IdSchema,
  titles: AniTitlesSchema,
  seasonYear: v.optional(v.nullable(v.number())),
  format: v.optional(v.nullable(AniFormatSchema)),
  coverImage: v.optional(v.nullable(AniListMetadataImageSchema)),
  updatedAt: v.number(),
});

export const AniListSearchResultSchema = v.object({
  id: IdSchema,
  title: AniTitlesSchema,
  coverImage: v.optional(v.nullable(AniListMetadataImageSchema)),
  format: v.optional(v.nullable(AniFormatSchema)),
  status: v.optional(v.nullable(AniStatusSchema)),
});

export const GetAniListMetadataInputSchema = v.object({
  ids: v.array(IdSchema),
  refreshStale: v.optional(v.boolean()),
  maxBatch: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});

// ============================================================================
// TypeScript types inferred from schemas
// ============================================================================

export type ResolveInput = v.InferOutput<typeof ResolveInputSchema>;
export type StatusInput = v.InferOutput<typeof StatusInputSchema>;
export type AddInput = v.InferOutput<typeof AddInputSchema>;
export type UpdateSonarrInput = v.InferOutput<typeof UpdateSonarrInputSchema>;
export type AddRadarrInput = v.InferOutput<typeof AddRadarrInputSchema>;
export type UpdateRadarrInput = v.InferOutput<typeof UpdateRadarrInputSchema>;
export type SetMappingOverrideInput = v.InferOutput<typeof SetMappingOverrideInputSchema>;
export type ClearMappingOverrideInput = v.InferOutput<typeof ClearMappingOverrideInputSchema>;
export type SonarrLookupInput = v.InferOutput<typeof SonarrLookupInputSchema>;
export type ValidateTvdbInput = v.InferOutput<typeof ValidateTvdbInputSchema>;
export type ValidateTmdbInput = v.InferOutput<typeof ValidateTmdbInputSchema>;
export type SetMappingIgnoreInput = v.InferOutput<typeof SetMappingIgnoreInputSchema>;
export type ClearMappingIgnoreInput = v.InferOutput<typeof ClearMappingIgnoreInputSchema>;
export type GetMappingsInput = v.InferOutput<typeof GetMappingsInputSchema>;
export type MappingSummaryDto = v.InferOutput<typeof MappingSummarySchema>;
export type MappingCursor = v.InferOutput<typeof MappingCursorSchema>;
export type AniListMetadataDto = v.InferOutput<typeof AniListMetadataSchema>;
export type SearchAniListInput = v.InferOutput<typeof SearchAniListInputSchema>;
export type AniListSearchResultDto = v.InferOutput<typeof AniListSearchResultSchema>;
export type GetAniListMetadataInput = v.InferOutput<typeof GetAniListMetadataInputSchema>;
export type RadarrLookupInput = v.InferOutput<typeof RadarrLookupInputSchema>;

// ============================================================================
// Output types
// ============================================================================

export interface MappingOutput {
  tvdbId: number | null;
  successfulSynonym?: string;
}

export type StatusOutput = CheckSeriesStatusResponse;
export type MovieStatusOutput = CheckMovieStatusResponse;

export interface MappingOverrideItem {
  anilistId: number;
  provider: 'sonarr' | 'radarr';
  externalId: {
    id: number;
    kind: 'tvdb' | 'tmdb';
  };
  updatedAt: number;
}

export interface GetMappingsOutput {
  mappings: MappingSummary[];
  nextCursor?: MappingCursor | null;
  total?: number;
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

export interface RadarrLookupOutput {
  results: RadarrLookupMovie[];
  libraryTmdbIds: number[];
  linkedAniListIdsByTmdbId?: Record<number, number[]>;
}

export interface ValidateTmdbOutput {
  inLibrary: boolean;
  inCatalog: boolean;
}

export interface GetRadarrMetadataOutput {
  qualityProfiles: RadarrQualityProfile[];
  rootFolders: RadarrRootFolder[];
  tags: RadarrTag[];
}

export type AddRadarrOutput = RadarrMovie;
export type UpdateRadarrOutput = RadarrMovie;

export interface GetAniListMetadataOutput {
  metadata: AniListMetadataDto[];
  missingIds?: number[];
}

export type GetAniListSchedulerDebugOutput = AniListSchedulerDebugSnapshot;
