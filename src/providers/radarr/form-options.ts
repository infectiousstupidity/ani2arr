/** Static Radarr form select options shared by modal and options-page UI. */
// src/providers/radarr/form-options.ts

import {
	RADARR_MINIMUM_AVAILABILITY_OPTIONS,
	RADARR_MOVIE_MONITOR_OPTIONS,
	type RadarrMinimumAvailability,
	type RadarrMovieMonitor,
} from "./schemas";

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

export const RADARR_MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS =
	RADARR_MINIMUM_AVAILABILITY_OPTIONS.map((value) => ({
		value,
		...RADARR_MINIMUM_AVAILABILITY_DETAILS[value],
	}));

export const RADARR_ADD_MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS =
	RADARR_MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS.filter(
		(option) => option.value !== "deleted",
	);

const RADARR_MOVIE_MONITOR_DETAILS = {
	movieOnly: {
		label: "Movie Only",
		description: "Monitor the movie, but not its collection.",
	},
	movieAndCollection: {
		label: "Movie + Collection",
		description: "Monitor the movie and related collection items.",
	},
	none: {
		label: "None",
		description: "Add the movie without monitoring it.",
	},
} satisfies Record<RadarrMovieMonitor, { label: string; description: string }>;

export const RADARR_MOVIE_MONITOR_OPTIONS_WITH_DESCRIPTIONS =
	RADARR_MOVIE_MONITOR_OPTIONS.map((value) => ({
		value,
		...RADARR_MOVIE_MONITOR_DETAILS[value],
	}));
