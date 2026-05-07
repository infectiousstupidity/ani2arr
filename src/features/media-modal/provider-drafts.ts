/** Pure draft builders for media modal add and edit setup flows. */
// src/features/media-modal/provider-drafts.ts

import type { RadarrMovie } from "@/providers";
import type { SonarrSeries } from "@/providers/sonarr/types";
import {
	normalizeSonarrFormState,
	type SonarrFormState,
} from "@/providers/sonarr/form-state";
import type { SonarrEditMonitoringAction } from "@/providers/sonarr/schemas";
import {
	normalizeRadarrFormState,
	type RadarrFormState,
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
