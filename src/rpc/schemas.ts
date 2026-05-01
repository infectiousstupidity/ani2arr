/** Valibot schemas for RPC inputs that cross the extension messaging boundary. */
// src/rpc/schemas.ts
import * as v from "valibot";
import { AniListIdSchema } from "@/anilist/anilist-id";
import { AniListMediaHintSchema } from "@/anilist/schemas/media.schema";
import { MAPPING_ENTRY_KIND_VALUES } from "@/mapping/types";
import { PROVIDERS, TmdbIdSchema, TvdbIdSchema } from "@/providers";
import {
	RadarrFormStateSchema,
	SonarrEditMonitoringActionSchema,
	SonarrFormStateSchema,
} from "@/providers/settings/provider-settings.schema";

// ============================================================================
// Shared / Reusable Validators
// ============================================================================

const ProviderSchema = v.picklist(PROVIDERS);
const MappingEntryKindSchema = v.picklist(MAPPING_ENTRY_KIND_VALUES);
const ProviderMappingIdSchema = v.variant("provider", [
	v.object({
		provider: v.literal("sonarr"),
		providerId: TvdbIdSchema,
	}),
	v.object({
		provider: v.literal("radarr"),
		providerId: TmdbIdSchema,
	}),
]);

/**
 * Standard non-empty string validation
 */
const createRequiredStringSchema = (msg: string = "Value cannot be empty") =>
	v.pipe(v.string(), v.nonEmpty(msg));

const createTrimmedRequiredStringSchema = (
	msg: string = "Value cannot be empty",
) => v.pipe(v.string(), v.trim(), v.nonEmpty(msg));

// ============================================================================
// Component Schemas
// ============================================================================

const RequestPrioritySchema = v.picklist(["high", "normal", "low"]);

const ProviderCredentialsSchema = v.object({
	url: createTrimmedRequiredStringSchema("URL cannot be empty"),
	apiKey: createTrimmedRequiredStringSchema("API key cannot be empty"),
});

// ============================================================================
// RPC Input Schemas
// ============================================================================

export const StatusInputSchema = v.object({
	anilistId: AniListIdSchema,
	title: v.optional(v.string()),
	force_verify: v.optional(v.boolean()),
	network: v.optional(v.literal("never")),
	metadata: v.optional(v.nullable(AniListMediaHintSchema)),
	priority: v.optional(RequestPrioritySchema),
});

export const SeriesLibraryStatusInputSchema = v.object({
	anilistId: AniListIdSchema,
	providerId: TvdbIdSchema,
	forceVerify: v.optional(v.boolean()),
});

export const MovieLibraryStatusInputSchema = v.object({
	anilistId: AniListIdSchema,
	providerId: TmdbIdSchema,
	forceVerify: v.optional(v.boolean()),
});

export const AddSonarrInputSchema = v.object({
	anilistId: AniListIdSchema,
	title: createRequiredStringSchema("Title cannot be empty"),
	primaryTitleHint: v.optional(v.string()),
	metadata: v.optional(v.nullable(AniListMediaHintSchema)),
	form: SonarrFormStateSchema,
});

export const UpdateSonarrInputSchema = v.object({
	anilistId: AniListIdSchema,
	tvdbId: TvdbIdSchema,
	title: createRequiredStringSchema("Title cannot be empty"),
	form: SonarrFormStateSchema,
	monitoringAction: v.optional(SonarrEditMonitoringActionSchema),
});

export const AddRadarrInputSchema = v.object({
	anilistId: AniListIdSchema,
	title: createRequiredStringSchema("Title cannot be empty"),
	primaryTitleHint: v.optional(v.string()),
	metadata: v.optional(v.nullable(AniListMediaHintSchema)),
	form: RadarrFormStateSchema,
});

export const UpdateRadarrInputSchema = v.object({
	anilistId: AniListIdSchema,
	tmdbId: TmdbIdSchema,
	title: createRequiredStringSchema("Title cannot be empty"),
	form: RadarrFormStateSchema,
});

export const SetManualMappingInputSchema = v.intersect([
	v.object({
		anilistId: AniListIdSchema,
		force: v.optional(v.boolean()),
	}),
	ProviderMappingIdSchema,
]);

export const ClearManualMappingInputSchema = v.object({
	anilistId: AniListIdSchema,
	provider: ProviderSchema,
});

export const SetMappingIgnoreInputSchema = v.object({
	anilistId: AniListIdSchema,
	provider: ProviderSchema,
});

export const ClearMappingIgnoreInputSchema = v.object({
	anilistId: AniListIdSchema,
	provider: ProviderSchema,
});

export const SetMappingRejectedCandidateInputSchema = v.intersect([
	v.object({
		anilistId: AniListIdSchema,
	}),
	ProviderMappingIdSchema,
]);

export const ClearMappingRejectedCandidateInputSchema = v.intersect([
	v.object({
		anilistId: AniListIdSchema,
	}),
	ProviderMappingIdSchema,
]);

export const SonarrLookupInputSchema = v.object({
	term: createRequiredStringSchema("Search term cannot be empty"),
	priority: v.optional(RequestPrioritySchema),
	force_network: v.optional(v.boolean()),
});

export const ValidateTvdbInputSchema = v.object({
	tvdbId: TvdbIdSchema,
});

export const ValidateTmdbInputSchema = v.object({
	tmdbId: TmdbIdSchema,
});

// Array inputs
export const PrefetchAniListMediaInputSchema = v.array(AniListIdSchema);
export const GetStaticMappedInputSchema = v.array(AniListIdSchema);
export const GetMappingIdentitiesInputSchema = v.array(AniListIdSchema);

// Single ID inputs
export { AniListIdSchema as FetchAniListMediaInputSchema } from "@/anilist/anilist-id";

export const TestProviderConnectionInputSchema = v.object({
	provider: ProviderSchema,
	credentials: ProviderCredentialsSchema,
});

export const NotifyProviderConnectionChangedInputSchema = v.optional(
	v.object({
		changedProviders: v.optional(v.array(ProviderSchema)),
		disconnectedProviders: v.optional(v.array(ProviderSchema)),
	}),
);

export const GetProviderMetadataInputSchema = v.optional(
	v.object({
		credentials: v.optional(ProviderCredentialsSchema),
	}),
);

export const RadarrLookupInputSchema = v.object({
	term: createRequiredStringSchema("Search term cannot be empty"),
	priority: v.optional(RequestPrioritySchema),
	force_network: v.optional(v.boolean()),
});

export const MappingCursorSchema = v.object({
	updatedAt: v.number(),
	anilistId: AniListIdSchema,
	provider: ProviderSchema,
});

export const GetMappingsInputSchema = v.optional(
	v.object({
		entryKinds: v.optional(v.array(MappingEntryKindSchema)),
		providers: v.optional(v.array(ProviderSchema)),
		limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
		cursor: v.optional(MappingCursorSchema),
		query: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
	}),
);

export const GetMappingInspectionInputSchema = v.object({
	anilistId: AniListIdSchema,
	provider: ProviderSchema,
});

export const GetAniListMetadataInputSchema = v.object({
	ids: v.array(AniListIdSchema),
	refreshStale: v.optional(v.boolean()),
	fetchMissing: v.optional(v.boolean()),
	maxBatch: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});

// ============================================================================
// TypeScript types inferred from schemas
// ============================================================================

export type StatusInput = v.InferOutput<typeof StatusInputSchema>;
export type SeriesLibraryStatusInput = v.InferOutput<
	typeof SeriesLibraryStatusInputSchema
>;
export type MovieLibraryStatusInput = v.InferOutput<
	typeof MovieLibraryStatusInputSchema
>;
export type AddSonarrInput = v.InferOutput<typeof AddSonarrInputSchema>;
export type UpdateSonarrInput = v.InferOutput<typeof UpdateSonarrInputSchema>;
export type AddRadarrInput = v.InferOutput<typeof AddRadarrInputSchema>;
export type UpdateRadarrInput = v.InferOutput<typeof UpdateRadarrInputSchema>;
export type SetManualMappingInput = v.InferOutput<
	typeof SetManualMappingInputSchema
>;
export type ClearManualMappingInput = v.InferOutput<
	typeof ClearManualMappingInputSchema
>;
export type SonarrLookupInput = v.InferOutput<typeof SonarrLookupInputSchema>;
export type ValidateTvdbInput = v.InferOutput<typeof ValidateTvdbInputSchema>;
export type ValidateTmdbInput = v.InferOutput<typeof ValidateTmdbInputSchema>;
export type SetMappingIgnoreInput = v.InferOutput<
	typeof SetMappingIgnoreInputSchema
>;
export type ClearMappingIgnoreInput = v.InferOutput<
	typeof ClearMappingIgnoreInputSchema
>;
export type SetMappingRejectedCandidateInput = v.InferOutput<
	typeof SetMappingRejectedCandidateInputSchema
>;
export type ClearMappingRejectedCandidateInput = v.InferOutput<
	typeof ClearMappingRejectedCandidateInputSchema
>;
export type GetMappingsInput = v.InferOutput<typeof GetMappingsInputSchema>;
export type GetMappingIdentitiesInput = v.InferOutput<
	typeof GetMappingIdentitiesInputSchema
>;
export type GetMappingInspectionInput = v.InferOutput<
	typeof GetMappingInspectionInputSchema
>;
export type MappingCursor = v.InferOutput<typeof MappingCursorSchema>;
export type GetAniListMetadataInput = v.InferOutput<
	typeof GetAniListMetadataInputSchema
>;
export type RadarrLookupInput = v.InferOutput<typeof RadarrLookupInputSchema>;
export type TestProviderConnectionInput = v.InferOutput<
	typeof TestProviderConnectionInputSchema
>;
export type GetProviderMetadataInput = v.InferOutput<
	typeof GetProviderMetadataInputSchema
>;
export type NotifyProviderConnectionChangedInput = v.InferOutput<
	typeof NotifyProviderConnectionChangedInputSchema
>;
