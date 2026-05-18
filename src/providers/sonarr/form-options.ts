/** Static Sonarr form select options shared by modal and options-page UI. */
// src/providers/sonarr/form-options.ts

import {
	SONARR_EDIT_MONITORING_ACTIONS,
	SONARR_MONITOR_NEW_ITEMS_OPTIONS,
	SONARR_MONITOR_OPTIONS,
	SONARR_SERIES_TYPES,
	type SonarrMonitorOption,
	type SonarrSeriesType,
} from "./schemas";

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

export const SONARR_MONITOR_OPTIONS_WITH_DESCRIPTIONS =
	SONARR_MONITOR_OPTIONS.map((value) => ({
		value,
		...SONARR_MONITOR_OPTION_DETAILS[value],
	}));

export const SONARR_EDIT_MONITORING_ACTION_OPTIONS_WITH_DESCRIPTIONS =
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

export const SONARR_MONITOR_NEW_ITEMS_OPTIONS_WITH_DESCRIPTIONS =
	SONARR_MONITOR_NEW_ITEMS_OPTIONS.map((value) =>
		value === "all"
			? {
					value,
					label: "All",
					description: "Monitor episodes from new seasons.",
				}
			: {
					value,
					label: "None",
					description: "Do not monitor episodes from new seasons.",
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

export const SONARR_SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS =
	SONARR_SERIES_TYPES.map((value) => ({
		value,
		...SONARR_SERIES_TYPE_DETAILS[value],
	}));
