/** Pure Sonarr setup target and default-value helpers for the media modal. */
// src/features/media-modal/sonarr/sonarr-setup-values.ts

import type { AniListId } from "@/anilist";
import { isSonarrSeriesId, parseTvdbIdOrNull, type TvdbId } from "@/providers";
import {
	normalizeSonarrFormState,
	type SonarrFormState,
} from "@/providers/sonarr/form-state";
import type { SonarrEditMonitoringAction } from "@/providers/sonarr/schemas";
import type { SonarrSeries } from "@/providers/sonarr/types";
import type { CheckSeriesStatusResponse } from "@/rpc/types";

export const SONARR_EDIT_MONITORING_ACTION_DEFAULT = "noChange" as const;

export type SonarrEditDefaults = {
	form: SonarrFormState;
	monitoringAction: SonarrEditMonitoringAction;
};

export type SonarrSetupTarget = {
	key: string;
	tvdbId: TvdbId;
	title: string;
	initialFormValues: SonarrFormState;
	initialMonitoringAction: SonarrEditMonitoringAction;
} & (
	| {
			mode: "add";
			providerFolderName?: string | undefined;
	  }
	| {
			mode: "edit";
			series: SonarrSeries;
	  }
);

type CreateSonarrSetupTargetInput = {
	anilistId: AniListId;
	status: CheckSeriesStatusResponse | null | undefined;
	targetTitle: string;
	storedDefaults: Partial<SonarrFormState> | null | undefined;
	providerFolderName?: string | null | undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const hasEditableProviderFields = (value: Record<string, unknown>): boolean =>
	typeof value.rootFolderPath === "string" &&
	typeof value.qualityProfileId === "number";

const hasEditableSonarrFields = (value: Record<string, unknown>): boolean =>
	hasEditableProviderFields(value) &&
	typeof value.path === "string" &&
	typeof value.seriesType === "string" &&
	typeof value.seasonFolder === "boolean" &&
	typeof value.monitored === "boolean" &&
	(value.monitorNewItems === "all" || value.monitorNewItems === "none");

const isFullSonarrSeries = (value: unknown): value is SonarrSeries =>
	isRecord(value) &&
	isSonarrSeriesId(value.id) &&
	parseTvdbIdOrNull(value.tvdbId) !== null &&
	typeof value.title === "string" &&
	typeof value.titleSlug === "string" &&
	hasEditableSonarrFields(value);

function readProviderFolderName(value: unknown): string | undefined {
	if (!isRecord(value) || typeof value.folder !== "string") return undefined;

	const folder = value.folder.trim();
	return folder.length > 0 ? folder : undefined;
}

export function hasFullSonarrEditItem(
	status: CheckSeriesStatusResponse | null | undefined,
): status is CheckSeriesStatusResponse & { series: SonarrSeries } {
	return status?.isInLibrary === true && isFullSonarrSeries(status.series);
}

export function getSonarrAddDefaults(
	defaults: Partial<SonarrFormState> | null | undefined,
): SonarrFormState {
	return normalizeSonarrFormState(defaults);
}

export function getSonarrEditDefaults(
	series: SonarrSeries,
): SonarrEditDefaults {
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

export function canShowSonarrSetup(input: {
	isConfigured: boolean;
	status: CheckSeriesStatusResponse | null | undefined;
}): boolean {
	return input.isConfigured && input.status?.providerMappingState === "mapped";
}

export function getSonarrSetupTarget({
	anilistId,
	providerFolderName,
	status,
	storedDefaults,
	targetTitle,
}: CreateSonarrSetupTargetInput): SonarrSetupTarget | null {
	if (hasFullSonarrEditItem(status)) {
		const series = status.series;
		const defaults = getSonarrEditDefaults(series);

		return {
			mode: "edit",
			key: `sonarr:edit:${anilistId}:${series.id}`,
			tvdbId: series.tvdbId,
			title: series.title,
			series,
			initialFormValues: defaults.form,
			initialMonitoringAction: defaults.monitoringAction,
		};
	}

	if (
		status?.providerMappingState !== "mapped" ||
		status.isInLibrary !== false
	) {
		return null;
	}

	const tvdbId = parseTvdbIdOrNull(status.providerId);
	if (tvdbId === null) return null;

	const lookupFolderName =
		providerFolderName?.trim() ||
		readProviderFolderName(status.series) ||
		undefined;

	return {
		mode: "add",
		key: `sonarr:add:${anilistId}:${tvdbId}`,
		tvdbId,
		title: targetTitle,
		initialFormValues: getSonarrAddDefaults(storedDefaults),
		initialMonitoringAction: SONARR_EDIT_MONITORING_ACTION_DEFAULT,
		...(lookupFolderName === undefined
			? {}
			: { providerFolderName: lookupFolderName }),
	};
}

export function getSonarrSetupStatusNotice(input: {
	verificationFailed: boolean;
}): string | null {
	if (input.verificationFailed) {
		return "Unable to verify the current Sonarr library status right now. Setup changes stay disabled until verification succeeds.";
	}

	return null;
}
