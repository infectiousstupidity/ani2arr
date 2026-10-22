/** Pure Radarr setup target and default-value helpers for the media modal. */
// src/features/media-modal/radarr/radarr-setup-values.ts

import * as v from "valibot";
import {
	parseTmdbIdOrNull,
	RadarrMovieIdSchema,
} from "@/providers/schemas";
import type { RadarrMovie } from "@/providers/radarr/types";
import type { TmdbId } from "@/providers/schemas";
import {
	normalizeRadarrDefaults,
	normalizeRadarrFormState,
	type RadarrFormState,
} from "@/providers/radarr/form-state";
import type { GetMovieStatusOutput } from "@/rpc/types";
import { areArraysEqual } from "../helpers";

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
	identityKey: string;
	status: GetMovieStatusOutput | null | undefined;
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
	v.safeParse(RadarrMovieIdSchema, value.id).success &&
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
	status: GetMovieStatusOutput | null | undefined,
): status is GetMovieStatusOutput & { movie: RadarrMovie } {
	return status?.isInLibrary === true && isFullRadarrMovie(status.movie);
}

export function getRadarrAddDefaults(
	defaults: Partial<RadarrFormState> | null | undefined,
): RadarrFormState {
	return normalizeRadarrDefaults(defaults);
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

export function isRadarrSetupDraftDirty(input: {
	baselineValues: RadarrFormState;
	values: RadarrFormState;
}): boolean {
	const { baselineValues, values } = input;

	return (
		values.qualityProfileId !== baselineValues.qualityProfileId ||
		values.rootFolderPath !== baselineValues.rootFolderPath ||
		values.minimumAvailability !== baselineValues.minimumAvailability ||
		values.monitored !== baselineValues.monitored ||
		values.addOptions?.monitor !== baselineValues.addOptions?.monitor ||
		values.addOptions?.searchForMovie !==
			baselineValues.addOptions?.searchForMovie ||
		!areArraysEqual(values.tags, baselineValues.tags) ||
		!areArraysEqual(values.freeformTags, baselineValues.freeformTags)
	);
}

export function canShowRadarrSetup(input: {
	isConfigured: boolean;
	status: GetMovieStatusOutput | null | undefined;
}): boolean {
	return input.isConfigured && input.status?.mapping.kind === "mapped";
}

export function getRadarrSetupTarget({
	identityKey,
	providerFolderName,
	status,
	storedDefaults,
	targetTitle,
}: CreateRadarrSetupTargetInput): RadarrSetupTarget | null {
	if (hasFullRadarrEditItem(status)) {
		const movie = status.movie;

		return {
			mode: "edit",
			key: `radarr:edit:${identityKey}:${movie.id}`,
			tmdbId: movie.tmdbId,
			title: movie.title,
			movie,
			initialFormValues: getRadarrEditDefaults(movie),
		};
	}

	if (
		status?.mapping.kind !== "mapped" ||
		status.isInLibrary !== false
	) {
		return null;
	}

	const tmdbId = parseTmdbIdOrNull(status.mapping.providerId);
	if (tmdbId === null) return null;

	const lookupFolderName =
		providerFolderName?.trim() ||
		readProviderFolderName(status.movie) ||
		undefined;

	return {
		mode: "add",
		key: `radarr:add:${identityKey}:${tmdbId}`,
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
