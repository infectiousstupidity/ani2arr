/** Pure Radarr setup target and default-value helpers for the media modal. */
// src/features/media-modal/radarr/radarr-setup-values.ts

import type { AniListId } from "@/anilist";
import {
	isRadarrMovieId,
	parseTmdbIdOrNull,
	type RadarrMovie,
	type TmdbId,
} from "@/providers";
import {
	normalizeRadarrFormState,
	type RadarrFormState,
} from "@/providers/radarr/form-state";
import type { CheckMovieStatusResponse } from "@/rpc/types";

export type RadarrSetupTarget = {
	key: string;
	tmdbId: TmdbId;
	title: string;
	initialFormValues: RadarrFormState;
} & (
	| {
			mode: "add";
			providerFolderName?: string | undefined;
	  }
	| {
			mode: "edit";
			movie: RadarrMovie;
	  }
);

type CreateRadarrSetupTargetInput = {
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

const hasEditableRadarrFields = (value: Record<string, unknown>): boolean =>
	hasEditableProviderFields(value) && typeof value.monitored === "boolean";

const isFullRadarrMovie = (value: unknown): value is RadarrMovie =>
	isRecord(value) &&
	isRadarrMovieId(value.id) &&
	parseTmdbIdOrNull(value.tmdbId) !== null &&
	typeof value.title === "string" &&
	hasEditableRadarrFields(value);

function readProviderFolderName(value: unknown): string | undefined {
	if (!isRecord(value) || typeof value.folderName !== "string") {
		return undefined;
	}

	const folderName = value.folderName.trim();
	return folderName.length > 0 ? folderName : undefined;
}

export function hasFullRadarrEditItem(
	status: CheckMovieStatusResponse | null | undefined,
): status is CheckMovieStatusResponse & { movie: RadarrMovie } {
	return status?.isInLibrary === true && isFullRadarrMovie(status.movie);
}

export function getRadarrAddDefaults(
	defaults: Partial<RadarrFormState> | null | undefined,
): RadarrFormState {
	return normalizeRadarrFormState(defaults);
}

export function getRadarrEditDefaults(movie: RadarrMovie): RadarrFormState {
	return normalizeRadarrFormState({
		qualityProfileId: movie.qualityProfileId,
		rootFolderPath: movie.rootFolderPath,
		monitored: movie.monitored,
		minimumAvailability: movie.minimumAvailability,
		tags: movie.tags,
		freeformTags: [],
	});
}

export function canShowRadarrSetup(input: {
	isConfigured: boolean;
	status: CheckMovieStatusResponse | null | undefined;
}): boolean {
	return input.isConfigured && input.status?.providerMappingState === "mapped";
}

export function getRadarrSetupTarget({
	anilistId,
	providerFolderName,
	status,
	storedDefaults,
	targetTitle,
}: CreateRadarrSetupTargetInput): RadarrSetupTarget | null {
	if (hasFullRadarrEditItem(status)) {
		const movie = status.movie;

		return {
			mode: "edit",
			key: `radarr:edit:${anilistId}:${movie.id}`,
			tmdbId: movie.tmdbId,
			title: movie.title,
			movie,
			initialFormValues: getRadarrEditDefaults(movie),
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
		readProviderFolderName(status.movie) ||
		undefined;

	return {
		mode: "add",
		key: `radarr:add:${anilistId}:${tmdbId}`,
		tmdbId,
		title: targetTitle,
		initialFormValues: getRadarrAddDefaults(storedDefaults),
		...(lookupFolderName === undefined
			? {}
			: { providerFolderName: lookupFolderName }),
	};
}

export function getRadarrSetupStatusNotice(input: {
	verificationFailed: boolean;
}): string | null {
	if (input.verificationFailed) {
		return "Unable to verify the current Radarr library status right now. Setup changes stay disabled until verification succeeds.";
	}

	return null;
}
