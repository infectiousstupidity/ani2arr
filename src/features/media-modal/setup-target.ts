/** Pure setup-target rules for media modal add and edit flows. */
// src/features/media-modal/setup-target.ts

import type { AniListId } from "@/anilist";
import type { RadarrMovie, TmdbId, TvdbId } from "@/providers";
import type { SonarrSeries } from "@/providers/sonarr/types";
import {
	isRadarrMovieId,
	isSonarrSeriesId,
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
} from "@/providers";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import type { SonarrEditMonitoringAction } from "@/providers/sonarr/schemas";
import type {
	RadarrFormState,
} from "@/providers/settings/provider-settings.schema";
import type {
	CheckMovieStatusResponse,
	CheckSeriesStatusResponse,
} from "@/rpc/types";
import {
	buildRadarrAddDraft,
	buildRadarrEditDraft,
	buildSonarrAddDraft,
	buildSonarrEditDraft,
} from "./provider-drafts";

export type SonarrSetupTarget = {
	provider: "sonarr";
	key: string;
	anilistId: AniListId;
	tvdbId: TvdbId;
	targetTitle: string;
	initialFormDraft: SonarrFormState;
	initialMonitoringAction: SonarrEditMonitoringAction;
} & (
	| { setupMode: "add"; providerFolderName?: string | undefined }
	| {
			setupMode: "edit";
			seriesId: SonarrSeries["id"];
			existingItem: SonarrSeries;
	  }
);

export type RadarrSetupTarget = {
	provider: "radarr";
	key: string;
	anilistId: AniListId;
	tmdbId: TmdbId;
	targetTitle: string;
	initialFormDraft: RadarrFormState;
} & (
	| { setupMode: "add"; providerFolderName?: string | undefined }
	| {
			setupMode: "edit";
			movieId: RadarrMovie["id"];
			existingItem: RadarrMovie;
	  }
);

export type SetupTarget = SonarrSetupTarget | RadarrSetupTarget;

type SonarrSetupTargetCandidateInput = {
	anilistId: AniListId;
	status: CheckSeriesStatusResponse | null | undefined;
	targetTitle: string;
	storedDefaults: Partial<SonarrFormState> | null | undefined;
	providerFolderName?: string | null | undefined;
};

type RadarrSetupTargetCandidateInput = {
	anilistId: AniListId;
	status: CheckMovieStatusResponse | null | undefined;
	targetTitle: string;
	storedDefaults: Partial<RadarrFormState> | null | undefined;
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

const hasEditableRadarrFields = (value: Record<string, unknown>): boolean =>
	hasEditableProviderFields(value) &&
	typeof value.monitored === "boolean";

const readProviderFolderName = (value: unknown): string | undefined => {
	if (!isRecord(value) || typeof value.folder !== "string") return undefined;

	const folder = value.folder.trim();
	return folder.length > 0 ? folder : undefined;
};

const readProviderFolderNameFromMovie = (value: unknown): string | undefined => {
	if (!isRecord(value) || typeof value.folderName !== "string") return undefined;

	const folderName = value.folderName.trim();
	return folderName.length > 0 ? folderName : undefined;
};

const isFullSonarrSeries = (value: unknown): value is SonarrSeries =>
	isRecord(value) &&
	isSonarrSeriesId(value.id) &&
	parseTvdbIdOrNull(value.tvdbId) !== null &&
	typeof value.title === "string" &&
	typeof value.titleSlug === "string" &&
	hasEditableSonarrFields(value);

const isFullRadarrMovie = (value: unknown): value is RadarrMovie =>
	isRecord(value) &&
	isRadarrMovieId(value.id) &&
	parseTmdbIdOrNull(value.tmdbId) !== null &&
	typeof value.title === "string" &&
	hasEditableRadarrFields(value);

export function hasFullSonarrEditItem(
	status: CheckSeriesStatusResponse | null | undefined,
): status is CheckSeriesStatusResponse & { series: SonarrSeries } {
	return status?.isInLibrary === true && isFullSonarrSeries(status.series);
}

export function hasFullRadarrEditItem(
	status: CheckMovieStatusResponse | null | undefined,
): status is CheckMovieStatusResponse & { movie: RadarrMovie } {
	return status?.isInLibrary === true && isFullRadarrMovie(status.movie);
}

export const getSetupTargetKey = (target: SetupTarget): string => target.key;

export const isSameSetupTarget = (
	a: SetupTarget | null | undefined,
	b: SetupTarget | null | undefined,
): boolean => !!a && !!b && a.key === b.key;

export function getSonarrSetupTargetCandidateStatus({
	status,
	tvdbId,
}: {
	status: CheckSeriesStatusResponse | null | undefined;
	tvdbId: TvdbId;
}): CheckSeriesStatusResponse {
	if (status && parseTvdbIdOrNull(status.providerId) === tvdbId) return status;

	return {
		providerId: tvdbId,
		providerMappingState: "mapped",
		isInLibrary: false,
	};
}

export function getRadarrSetupTargetCandidateStatus({
	status,
	tmdbId,
}: {
	status: CheckMovieStatusResponse | null | undefined;
	tmdbId: TmdbId;
}): CheckMovieStatusResponse {
	if (status && parseTmdbIdOrNull(status.providerId) === tmdbId) return status;

	return {
		providerId: tmdbId,
		providerMappingState: "mapped",
		isInLibrary: false,
	};
}

export function createSonarrSetupTargetCandidate({
	anilistId,
	providerFolderName,
	status,
	storedDefaults,
	targetTitle,
}: SonarrSetupTargetCandidateInput): SonarrSetupTarget | null {
	if (hasFullSonarrEditItem(status)) {
		const existingItem = status.series;
		const { form, monitoringAction } = buildSonarrEditDraft(existingItem);

		return {
			provider: "sonarr",
			setupMode: "edit",
			key: `sonarr:edit:${anilistId}:${existingItem.id}`,
			anilistId,
			tvdbId: existingItem.tvdbId,
			seriesId: existingItem.id,
			targetTitle: existingItem.title,
			existingItem,
			initialFormDraft: form,
			initialMonitoringAction: monitoringAction,
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
		provider: "sonarr",
		setupMode: "add",
		key: `sonarr:add:${anilistId}:${tvdbId}`,
		anilistId,
		tvdbId,
		targetTitle,
		initialFormDraft: buildSonarrAddDraft(storedDefaults),
		initialMonitoringAction: "noChange",
		...(lookupFolderName === undefined
			? {}
			: { providerFolderName: lookupFolderName }),
	};
}

export function createRadarrSetupTargetCandidate({
	anilistId,
	providerFolderName,
	status,
	storedDefaults,
	targetTitle,
}: RadarrSetupTargetCandidateInput): RadarrSetupTarget | null {
	if (hasFullRadarrEditItem(status)) {
		const existingItem = status.movie;

		return {
			provider: "radarr",
			setupMode: "edit",
			key: `radarr:edit:${anilistId}:${existingItem.id}`,
			anilistId,
			tmdbId: existingItem.tmdbId,
			movieId: existingItem.id,
			targetTitle: existingItem.title,
			existingItem,
			initialFormDraft: buildRadarrEditDraft(existingItem),
		};
	}

	if (
		status?.providerMappingState !== "mapped" ||
		status.isInLibrary !== false
	) {
		return null;
	}

	const tmdbId = parseTmdbIdOrNull(status.providerId);
	if (tmdbId === null) return null;
	const lookupFolderName =
		providerFolderName?.trim() ||
		readProviderFolderNameFromMovie(status.movie) ||
		undefined;

	return {
		provider: "radarr",
		setupMode: "add",
		key: `radarr:add:${anilistId}:${tmdbId}`,
		anilistId,
		tmdbId,
		targetTitle,
		initialFormDraft: buildRadarrAddDraft(storedDefaults),
		...(lookupFolderName === undefined
			? {}
			: { providerFolderName: lookupFolderName }),
	};
}
