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
	freeformTags: FreeformTagsSchema,
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
});

export type RadarrFormState = v.InferOutput<typeof RadarrFormStateSchema>;

export function normalizeRadarrFormState(
	input: Partial<RadarrFormState> | null | undefined,
): RadarrFormState {
	return v.parse(RadarrFormStateSchema, input ?? {});
}

export function normalizeRadarrDefaults(
	input: Partial<RadarrFormState> | null | undefined,
): RadarrFormState {
	const defaults = normalizeRadarrFormState(input);

	return {
		...defaults,
		minimumAvailability: defaults.minimumAvailability ?? "released",
		addOptions: {
			...defaults.addOptions,
			monitor: defaults.addOptions?.monitor ?? "movieOnly",
			searchForMovie: defaults.addOptions?.searchForMovie ?? true,
		},
	};
}

export function stripRadarrFormStateForDefaults(
	input: RadarrFormState,
): v.InferOutput<typeof RadarrDefaultsSchema> {
	return v.parse(RadarrDefaultsSchema, input);
}

export const createDefaultRadarrFormState = (): RadarrFormState =>
	normalizeRadarrDefaults({});
