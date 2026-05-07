/** Radarr form state schemas, defaults, and storage/RPC normalization helpers. */
// src/providers/radarr/form-state.ts

import * as v from "valibot";

import {
	ProviderQualityProfileIdSchema,
	ProviderTagIdSchema,
} from "@/providers/schemas";

import {
	RADARR_MINIMUM_AVAILABILITY_OPTIONS,
	RadarrMinimumAvailabilitySchema,
} from "./schemas";
import type { RadarrMinimumAvailability } from "./schemas";

const FreeformTagsSchema = v.fallback(v.array(v.string()), []);

const RadarrProviderFieldEntries = {
	qualityProfileId: v.optional(ProviderQualityProfileIdSchema),
	rootFolderPath: v.optional(v.string()),
	monitored: v.optional(v.boolean()),
	tags: v.optional(v.array(ProviderTagIdSchema)),
	minimumAvailability: v.optional(RadarrMinimumAvailabilitySchema),
	addOptions: v.optional(
		v.object({
			searchForMovie: v.optional(v.boolean()),
		}),
	),
} as const;

export const RadarrDefaultsSchema = v.object(RadarrProviderFieldEntries);

export const RadarrFormStateSchema = v.object({
	...RadarrProviderFieldEntries,
	freeformTags: FreeformTagsSchema,
});

export type RadarrFormState = v.InferOutput<typeof RadarrFormStateSchema>;
export { RADARR_MINIMUM_AVAILABILITY_OPTIONS } from "./schemas";
export type { RadarrMinimumAvailability } from "./schemas";

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
		monitored: true,
		minimumAvailability: "released",
		addOptions: {
			searchForMovie: true,
		},
	});

const RADARR_MINIMUM_AVAILABILITY_DETAILS = {
	tba: {
		label: "TBA",
		description: "Wait until availability is no longer to be announced.",
	},
	announced: {
		label: "Announced",
		description: "Allow adds before a theatrical or digital date exists.",
	},
	inCinemas: {
		label: "In Cinemas",
		description: "Wait until the movie has a theatrical release.",
	},
	released: {
		label: "Released",
		description: "Wait until the movie is officially released.",
	},
	deleted: {
		label: "Deleted",
		description:
			"Matches the provider enum exactly, even though it is not expected for add defaults.",
	},
} satisfies Record<
	RadarrMinimumAvailability,
	{ label: string; description: string }
>;

export const MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS =
	RADARR_MINIMUM_AVAILABILITY_OPTIONS.map((value) => ({
		value,
		...RADARR_MINIMUM_AVAILABILITY_DETAILS[value],
	}));
