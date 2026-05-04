/** Shared provider settings schemas for Sonarr and Radarr. */

import * as v from "valibot";
import { AniListTitleLanguageSchema } from "@/anilist/schemas/title-language.schema";
import {
	ProviderQualityProfileIdSchema,
	ProviderTagIdSchema,
} from "@/providers/schemas";

// ============================================================================
// 1. SHARED BASE FIELDS
// ============================================================================

const FreeformTagsSchema = v.fallback(v.array(v.string()), []);

const SharedProviderFieldEntries = {
	qualityProfileId: v.optional(ProviderQualityProfileIdSchema),
	rootFolderPath: v.optional(v.string()),
	monitored: v.optional(v.boolean()),
	tags: v.optional(v.array(ProviderTagIdSchema)),
} as const;

// ============================================================================
// 2. SONARR SCHEMAS
// ============================================================================

export const SONARR_SERIES_TYPES = ["standard", "anime", "daily"] as const;
export const SONARR_MONITOR_OPTIONS = [
	"all",
	"future",
	"missing",
	"existing",
	"firstSeason",
	"lastSeason",
	"latestSeason",
	"pilot",
	"recent",
	"monitorSpecials",
	"unmonitorSpecials",
	"none",
] as const;

export const SonarrSeriesTypeSchema = v.picklist(SONARR_SERIES_TYPES);
export type SonarrSeriesType = v.InferOutput<typeof SonarrSeriesTypeSchema>;

export const SonarrMonitorOptionSchema = v.picklist(SONARR_MONITOR_OPTIONS);
export type SonarrMonitorOption = v.InferOutput<
	typeof SonarrMonitorOptionSchema
>;

export const SONARR_EDIT_MONITORING_ACTIONS = [
	"noChange",
	...SONARR_MONITOR_OPTIONS,
] as const;
export const SonarrEditMonitoringActionSchema = v.picklist(
	SONARR_EDIT_MONITORING_ACTIONS,
);
export type SonarrEditMonitoringAction = v.InferOutput<
	typeof SonarrEditMonitoringActionSchema
>;

const SonarrProviderFieldEntries = {
	...SharedProviderFieldEntries,
	seriesType: v.optional(SonarrSeriesTypeSchema),
	seasonFolder: v.optional(v.boolean()),
	addOptions: v.optional(
		v.object({
			monitor: v.optional(SonarrMonitorOptionSchema),
			searchForMissingEpisodes: v.optional(v.boolean()),
			searchForCutoffUnmetEpisodes: v.optional(v.boolean()),
		}),
	),
} as const;

export const SonarrDefaultsSchema = v.object(SonarrProviderFieldEntries);

export const SonarrFormStateSchema = v.object({
	...SonarrProviderFieldEntries,
	freeformTags: FreeformTagsSchema,
});
export type SonarrFormState = v.InferOutput<typeof SonarrFormStateSchema>;

export const SonarrSettingsSchema = v.object({
	url: v.string(),
	apiKey: v.string(),
	preferredAniListTitleLanguage: v.fallback(
		AniListTitleLanguageSchema,
		"english",
	),
	defaults: v.optional(SonarrDefaultsSchema),
});

export function normalizeSonarrFormState(
	input: Partial<SonarrFormState> | null | undefined,
): SonarrFormState {
	return v.parse(SonarrFormStateSchema, input ?? {});
}

export function stripSonarrFormStateForDefaults(
	input: SonarrFormState,
): v.InferOutput<typeof SonarrDefaultsSchema> {
	return v.parse(SonarrDefaultsSchema, input);
}

// ============================================================================
// 3. RADARR SCHEMAS
// ============================================================================

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

// ============================================================================
// 4. UI DICTIONARIES
// ============================================================================

const SONARR_MONITOR_OPTION_DETAILS = {
	all: {
		label: "All Episodes",
		description: "Monitor all episodes except specials.",
	},
	future: {
		label: "Future Episodes",
		description: "Monitor episodes that have not aired yet.",
	},
	missing: {
		label: "Missing Episodes",
		description:
			"Monitor episodes that do not have files or have not aired yet.",
	},
	existing: {
		label: "Existing Episodes",
		description: "Monitor episodes that have files or have not aired yet.",
	},
	firstSeason: {
		label: "First Season",
		description:
			"Monitor all episodes of the first season. All other seasons will be ignored.",
	},
	lastSeason: {
		label: "Last Season",
		description: "Monitor all episodes of the last season.",
	},
	latestSeason: {
		label: "Latest Season",
		description: "Monitor episodes in the latest season.",
	},
	pilot: {
		label: "Pilot Episode",
		description: "Only monitor the first episode of the first season.",
	},
	recent: {
		label: "Recent Episodes",
		description:
			"Monitor episodes aired within the last 90 days and future episodes.",
	},
	monitorSpecials: {
		label: "Monitor Specials",
		description:
			"Monitor all special episodes without changing the monitored status of other episodes.",
	},
	unmonitorSpecials: {
		label: "Unmonitor Specials",
		description:
			"Unmonitor all special episodes without changing the monitored status of other episodes.",
	},
	none: { label: "None", description: "No episodes will be monitored." },
} satisfies Record<SonarrMonitorOption, { label: string; description: string }>;

export const MONITOR_OPTIONS_WITH_DESCRIPTIONS = SONARR_MONITOR_OPTIONS.map(
	(value) => ({
		value,
		...SONARR_MONITOR_OPTION_DETAILS[value],
	}),
);

export const EDIT_MONITOR_ACTION_OPTIONS_WITH_DESCRIPTIONS =
	SONARR_EDIT_MONITORING_ACTIONS.map((value) =>
		value === "noChange"
			? {
					value,
					label: "No Change",
					description: "Do not apply a one-time episode monitoring action.",
				}
			: {
					value,
					...SONARR_MONITOR_OPTION_DETAILS[value],
				},
	);

const SONARR_SERIES_TYPE_DETAILS = {
	standard: {
		label: "Standard",
		description: "Episodes released with SxxEyy pattern.",
	},
	anime: {
		label: "Anime",
		description: "Episodes released using an absolute episode number.",
	},
	daily: {
		label: "Daily",
		description:
			"Episodes released daily or less frequently that use year-month-day (2023-08-04).",
	},
} satisfies Record<SonarrSeriesType, { label: string; description: string }>;

export const SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS = SONARR_SERIES_TYPES.map(
	(value) => ({
		value,
		...SONARR_SERIES_TYPE_DETAILS[value],
	}),
);

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
