/** Valibot schemas for RPC inputs that cross the extension messaging boundary. */
// src/rpc/schemas.ts
import * as v from 'valibot';
import { AniListMediaHintSchema } from '@/anilist/schemas/media.schema';
import { MAPPING_SOURCE_VALUES } from '@/mapping/types';
import { RadarrFormStateSchema } from '@/providers/settings/radarr-settings.schema';
import { SonarrFormStateSchema } from '@/providers/settings/sonarr-settings.schema';

// ============================================================================
// Shared / Reusable Validators
// ============================================================================

/**
 * Standard positive integer ID (used for AniList, TVDB, IDs, etc.)
 */
const IdSchema = v.pipe(v.number(), v.integer(), v.minValue(1));
const ProviderSchema = v.picklist(['sonarr', 'radarr']);
const MappingSourceSchema = v.picklist(MAPPING_SOURCE_VALUES);

/**
 * Standard non-empty string validation
 */
const createRequiredStringSchema = (msg: string = 'Value cannot be empty') =>
  v.pipe(v.string(), v.nonEmpty(msg));

// ============================================================================
// Component Schemas
// ============================================================================

const RequestPrioritySchema = v.picklist(['high', 'normal', 'low']);



const ProviderCredentialsSchema = v.object({
  url: createRequiredStringSchema('URL cannot be empty'),
  apiKey: createRequiredStringSchema('API key cannot be empty'),
});

// ============================================================================
// RPC Input Schemas
// ============================================================================

export const StatusInputSchema = v.object({
  anilistId: IdSchema,
  title: v.optional(v.string()),
  force_verify: v.optional(v.boolean()),
  network: v.optional(v.literal('never')),
  ignoreFailureCache: v.optional(v.boolean()),
  metadata: v.optional(v.nullable(AniListMediaHintSchema)),
  priority: v.optional(RequestPrioritySchema),
});

export const AddSonarrInputSchema = v.object({
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
  provider: ProviderSchema,
  providerId: IdSchema,
  force: v.optional(v.boolean()),
});

export const ClearMappingOverrideInputSchema = v.object({
  anilistId: IdSchema,
  provider: ProviderSchema,
});

export const SetMappingIgnoreInputSchema = v.object({
  anilistId: IdSchema,
  provider: ProviderSchema,
});

export const ClearMappingIgnoreInputSchema = v.object({
  anilistId: IdSchema,
  provider: ProviderSchema,
});

export const SetMappingRejectedCandidateInputSchema = v.object({
  anilistId: IdSchema,
  provider: ProviderSchema,
  providerId: IdSchema,
});

export const ClearMappingRejectedCandidateInputSchema = v.object({
  anilistId: IdSchema,
  provider: ProviderSchema,
  providerId: IdSchema,
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
  credentials: ProviderCredentialsSchema,
});

export const GetProviderMetadataInputSchema = v.optional(
  v.object({
    credentials: v.optional(ProviderCredentialsSchema),
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
  provider: ProviderSchema,
});

export const GetMappingsInputSchema = v.optional(
  v.object({
    sources: v.optional(v.array(MappingSourceSchema)),
    providers: v.optional(v.array(ProviderSchema)),
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

export type StatusInput = v.InferOutput<typeof StatusInputSchema>;
export type AddSonarrInput = v.InferOutput<typeof AddSonarrInputSchema>;
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
export type GetMappingsInput = v.InferOutput<typeof GetMappingsInputSchema>;
export type MappingCursor = v.InferOutput<typeof MappingCursorSchema>;
export type GetAniListMetadataInput = v.InferOutput<typeof GetAniListMetadataInputSchema>;
export type RadarrLookupInput = v.InferOutput<typeof RadarrLookupInputSchema>;
export type TestProviderConnectionInput = v.InferOutput<typeof TestProviderConnectionInputSchema>;
export type GetProviderMetadataInput = v.InferOutput<typeof GetProviderMetadataInputSchema>;
