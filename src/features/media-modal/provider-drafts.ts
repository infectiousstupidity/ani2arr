/** Pure draft builders for media modal add and edit setup flows. */

import type { RadarrMovie, SonarrSeries } from "@/providers";
import {
	normalizeRadarrFormState,
	normalizeSonarrFormState,
	type SonarrEditMonitoringAction,
	type RadarrFormState,
	type SonarrFormState,
} from "@/providers/settings/provider-settings.schema";

export const SONARR_EDIT_MONITORING_ACTION_DEFAULT = "noChange" as const;

export type SonarrEditDraft = {
	form: SonarrFormState;
	monitoringAction: SonarrEditMonitoringAction;
};

export function buildRadarrAddDraft(
	storedDefaults: Partial<RadarrFormState> | null | undefined,
): RadarrFormState {
	return normalizeRadarrFormState(storedDefaults);
}

export function buildSonarrAddDraft(
	storedDefaults: Partial<SonarrFormState> | null | undefined,
): SonarrFormState {
	return normalizeSonarrFormState(storedDefaults);
}

export function buildRadarrEditDraft(movie: RadarrMovie): RadarrFormState {
	return normalizeRadarrFormState({
		qualityProfileId: movie.qualityProfileId,
		rootFolderPath: movie.rootFolderPath,
		monitored: movie.monitored,
		minimumAvailability: movie.minimumAvailability,
		tags: movie.tags,
		addOptions: movie.addOptions,
		freeformTags: [],
	});
}

export function buildSonarrEditDraft(series: SonarrSeries): SonarrEditDraft {
	return {
		form: normalizeSonarrFormState({
			qualityProfileId: series.qualityProfileId,
			rootFolderPath: series.rootFolderPath,
			monitored: series.monitored,
			seriesType: series.seriesType,
			seasonFolder: series.seasonFolder,
			monitorNewItems: series.monitorNewItems,
			tags: series.tags,
			freeformTags: [],
		}),
		monitoringAction: SONARR_EDIT_MONITORING_ACTION_DEFAULT,
	};
}
