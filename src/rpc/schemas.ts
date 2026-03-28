/** Valibot schemas for RPC inputs that cross the extension messaging boundary. */
// src/rpc/schemas.ts
import * as v from 'valibot';

// ============================================================================
// Shared / Reusable Validators
// ============================================================================

/**
 * Standard positive integer ID (used for AniList, TVDB, IDs, etc.)
 */
const IdSchema = v.pipe(v.number(), v.integer(), v.minValue(1));
const MappingProviderSchema = v.picklist(['sonarr', 'radarr']);
const MappingSourceSchema = v.picklist(['manual', 'upstream', 'auto', 'rejected', 'blocked', 'ignored', 'unresolved']);

/**
 * Standard non-empty string validation
 */
const createRequiredStringSchema = (msg: string = 'Value cannot be empty') =>
  v.pipe(v.string(), v.nonEmpty(msg));

// ============================================================================
// Component Schemas
// ============================================================================

const RequestPrioritySchema = v.picklist(['high', 'normal', 'low']);

const AniListTitlesSchema = v.object({
  romaji: v.optional(v.string()),
  english: v.optional(v.string()),
  native: v.optional(v.string()),
});

const AniListMediaFormatSchema = v.picklist([
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

const AniListMediaHintSchema = v.object({
  titles: v.optional(v.nullable(AniListTitlesSchema)),
  synonyms: v.optional(v.nullable(v.array(v.string()))),
  startYear: v.optional(v.nullable(v.number())),
  format: v.optional(v.nullable(AniListMediaFormatSchema)),
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
  searchForCutoffUnmetEpisodes: v.boolean(),
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
const ProviderSchema = v.picklist(['sonarr', 'radarr']);

const SonarrCredentialsSchema = ArrCredentialsSchema;
const RadarrCredentialsSchema = ArrCredentialsSchema;

const MappingExternalIdSchema = v.object({
  id: IdSchema,
  kind: v.picklist(['tvdb', 'tmdb']),
});

// ============================================================================
// RPC Input Schemas
// ============================================================================

export const ResolveInputSchema = v.object({
  anilistId: IdSchema,
  primaryTitleHint: v.optional(v.string()),
  metadata: v.optional(v.nullable(AniListMediaHintSchema)),
});

export const StatusInputSchema = v.object({
  anilistId: IdSchema,
  title: v.optional(v.string()),
  force_verify: v.optional(v.boolean()),
  network: v.optional(v.literal('never')),
  ignoreFailureCache: v.optional(v.boolean()),
  metadata: v.optional(v.nullable(AniListMediaHintSchema)),
  priority: v.optional(RequestPrioritySchema),
});

export const AddInputSchema = v.object({
  anilistId: IdSchema,
  title: createRequiredStringSchema('Title cannot be empty'),
  primaryTitleHint: v.optional(v.string()),
  metadata: v.optional(v.nullable(AniListMediaHintSchema)),
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
  metadata: v.optional(v.nullable(AniListMediaHintSchema)),
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

export const SetMappingRejectedCandidateInputSchema = v.object({
  anilistId: IdSchema,
  provider: MappingProviderSchema,
  externalId: MappingExternalIdSchema,
});

export const ClearMappingRejectedCandidateInputSchema = v.object({
  anilistId: IdSchema,
  provider: MappingProviderSchema,
  externalId: MappingExternalIdSchema,
});

export const SetMappingBlockedCandidateInputSchema = v.object({
  anilistId: IdSchema,
  provider: MappingProviderSchema,
  externalId: MappingExternalIdSchema,
});

export const ClearMappingBlockedCandidateInputSchema = v.object({
  anilistId: IdSchema,
  provider: MappingProviderSchema,
  externalId: MappingExternalIdSchema,
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

export const TestProviderConnectionInputSchema = v.object({
  provider: ProviderSchema,
  credentials: ArrCredentialsSchema,
});

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

export const MappingCursorSchema = v.object({
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

export const GetAniListMetadataInputSchema = v.object({
  ids: v.array(IdSchema),
  refreshStale: v.optional(v.boolean()),
  fetchMissing: v.optional(v.boolean()),
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
export type SetMappingRejectedCandidateInput = v.InferOutput<typeof SetMappingRejectedCandidateInputSchema>;
export type ClearMappingRejectedCandidateInput = v.InferOutput<typeof ClearMappingRejectedCandidateInputSchema>;
export type SetMappingBlockedCandidateInput = v.InferOutput<typeof SetMappingBlockedCandidateInputSchema>;
export type ClearMappingBlockedCandidateInput = v.InferOutput<typeof ClearMappingBlockedCandidateInputSchema>;
export type GetMappingsInput = v.InferOutput<typeof GetMappingsInputSchema>;
export type MappingCursor = v.InferOutput<typeof MappingCursorSchema>;
export type SearchAniListInput = v.InferOutput<typeof SearchAniListInputSchema>;
export type GetAniListMetadataInput = v.InferOutput<typeof GetAniListMetadataInputSchema>;
export type RadarrLookupInput = v.InferOutput<typeof RadarrLookupInputSchema>;
export type TestProviderConnectionInput = v.InferOutput<typeof TestProviderConnectionInputSchema>;
