/** Radarr form state schemas, defaults, and storage/RPC normalization helpers. */
// src/providers/radarr/form-state.ts

import * as v from "valibot";

import {
	ProviderQualityProfileIdSchema,
	ProviderTagIdSchema,
} from "@/providers/schemas";

import {
	RadarrMinimumAvailabilitySchema,
	RadarrMovieMonitorSchema,
} from "./schemas";

const FreeformTagsSchema = v.fallback(v.array(v.string()), []);

const RadarrSharedFieldEntries = {
	qualityProfileId: v.optional(ProviderQualityProfileIdSchema),
	rootFolderPath: v.optional(v.string()),
	tags: v.optional(v.array(ProviderTagIdSchema)),
	minimumAvailability: v.optional(RadarrMinimumAvailabilitySchema),
} as const;

const RadarrAddFieldEntries = {
	...RadarrSharedFieldEntries,
	addOptions: v.optional(
		v.object({
			monitor: v.optional(RadarrMovieMonitorSchema),
			searchForMovie: v.optional(v.boolean()),
		}),
	),
} as const;

export const RadarrDefaultsSchema = v.object(RadarrAddFieldEntries);

export const RadarrFormStateSchema = v.object({
	...RadarrAddFieldEntries,
	monitored: v.optional(v.boolean()),
	freeformTags: FreeformTagsSchema,
});

export type RadarrFormState = v.InferOutput<typeof RadarrFormStateSchema>;
export {
	RADARR_MINIMUM_AVAILABILITY_OPTIONS,
	RADARR_MOVIE_MONITOR_OPTIONS,
} from "./schemas";
export type { RadarrMinimumAvailability, RadarrMovieMonitor } from "./schemas";

export function normalizeRadarrFormState(
	input: Partial<RadarrFormState> | null | undefined,
): RadarrFormState {
	return v.parse(RadarrFormStateSchema, input ?? {});
}

export function stripRadarrFormStateForDefaults(
	input: RadarrFormState,
): v.InferOutput<typeof RadarrDefaultsSchema> {
	return v.parse(RadarrDefaultsSchema, input);
}

export const createDefaultRadarrFormState = (): RadarrFormState =>
	normalizeRadarrFormState({
		...v.parse(RadarrDefaultsSchema, {}),
		minimumAvailability: "released",
		addOptions: {
			monitor: "movieOnly",
			searchForMovie: true,
		},
	});
