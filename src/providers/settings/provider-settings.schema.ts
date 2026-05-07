/** LEGACY: Temporary Radarr form/settings schemas until Radarr moves under src/providers/radarr. */
// src/providers/settings/provider-settings.schema.ts

import * as v from "valibot";
import { AniListTitleLanguageSchema } from "@/anilist/schemas/title-language.schema";
import {
	ProviderQualityProfileIdSchema,
	ProviderTagIdSchema,
} from "@/providers/schemas";

const FreeformTagsSchema = v.fallback(v.array(v.string()), []);

const SharedProviderFieldEntries = {
	qualityProfileId: v.optional(ProviderQualityProfileIdSchema),
	rootFolderPath: v.optional(v.string()),
	monitored: v.optional(v.boolean()),
	tags: v.optional(v.array(ProviderTagIdSchema)),
} as const;

export const RADARR_MINIMUM_AVAILABILITY_OPTIONS = [
	"tba",
	"announced",
	"inCinemas",
	"released",
	"deleted",
] as const;

export const RadarrMinimumAvailabilitySchema = v.picklist(
	RADARR_MINIMUM_AVAILABILITY_OPTIONS,
);
export type RadarrMinimumAvailability = v.InferOutput<
	typeof RadarrMinimumAvailabilitySchema
>;

const RadarrProviderFieldEntries = {
	...SharedProviderFieldEntries,
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

export const RadarrSettingsSchema = v.object({
	url: v.string(),
	apiKey: v.string(),
	preferredAniListTitleLanguage: v.fallback(
		AniListTitleLanguageSchema,
		"english",
	),
	defaults: v.optional(RadarrDefaultsSchema),
});

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
