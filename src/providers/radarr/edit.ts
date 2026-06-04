/** Radarr edit workflow for full-resource movie updates. */
// src/providers/radarr/edit.ts

import { createError } from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";
import {
	extractPathLeaf,
	extractRelativeFolder,
	joinRootAndFolder,
	shouldMoveProviderFiles,
} from "../provider-media-paths";
import type { ProviderCredentials } from "../types";
import type { RadarrClient } from "./client";
import type { RadarrFormState } from "./form-state";
import type {
	RadarrMovie,
	RadarrMovieId,
	RadarrQualityProfileId,
	TmdbId,
} from "./types";
import { resolveProviderTagIds } from "../provider-tags";

type RadarrMovieChanges = Partial<
	Pick<
		RadarrMovie,
		| "qualityProfileId"
		| "rootFolderPath"
		| "path"
		| "monitored"
		| "minimumAvailability"
		| "tags"
	>
>;

type UpdateRadarrMovieInput = {
	tmdbId: TmdbId;
	form: RadarrFormState;
	credentials: ProviderCredentials;
};

type UpdateRadarrMovieDeps = {
	client: RadarrClient;
};

type ResolvedRadarrMovieUpdate = {
	movieId: RadarrMovieId;
	payload: RadarrMovie;
	moveFiles: boolean;
};

function buildUpdateRadarrMoviePayload(
	movie: RadarrMovie,
	changes: RadarrMovieChanges,
): RadarrMovie {
	return {
		...movie,
		...changes,
	};
}

export async function updateRadarrMovie(
	input: UpdateRadarrMovieInput,
	deps: UpdateRadarrMovieDeps,
): Promise<RadarrMovie> {
	const resolvedUpdate = await resolveRadarrMovieUpdate({
		client: deps.client,
		credentials: input.credentials,
		form: input.form,
		tmdbId: input.tmdbId,
	});

	return deps.client.updateMovie(
		resolvedUpdate.movieId,
		resolvedUpdate.payload,
		input.credentials,
		{ moveFiles: resolvedUpdate.moveFiles },
	);
}

async function resolveRadarrMovieUpdate(input: {
	client: RadarrClient;
	credentials: ProviderCredentials;
	form: RadarrFormState;
	tmdbId: TmdbId;
}): Promise<ResolvedRadarrMovieUpdate> {
	const { client, credentials, form, tmdbId } = input;

	if (!Number.isFinite(tmdbId)) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			"Missing or invalid TMDB ID for update.",
			"Unable to update this movie because its TMDB ID is unknown.",
		);
	}

	const existing = await client.findMovieByTmdbId(tmdbId, credentials);
	if (!existing) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`Movie with TMDB ID ${tmdbId} not found in Radarr.`,
			"Cannot edit because this movie is not present in your Radarr library.",
		);
	}

	const baseMovie = await client.getMovieById(existing.id, credentials);

	const qualityProfileId = resolveRequiredQualityProfileId({
		value: form.qualityProfileId,
		fallback: baseMovie.qualityProfileId,
	});
	const rootFolderPath = resolveRequiredRootFolderPath({
		value: form.rootFolderPath,
		fallback: baseMovie.rootFolderPath,
	});
	const tags = await resolveProviderTagIds({
		provider: "radarr",
		client,
		credentials,
		existingIds: form.tags,
		freeformLabels: form.freeformTags,
	});
	const monitored = form.monitored ?? baseMovie.monitored;
	const minimumAvailability =
		form.minimumAvailability ?? baseMovie.minimumAvailability;
	const folderName =
		baseMovie.folderName ??
		extractRelativeFolder(baseMovie.path, baseMovie.rootFolderPath) ??
		extractPathLeaf(baseMovie.path);

	if (!folderName) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			"Missing Radarr movie folder for update.",
			"Unable to update this movie because its current folder path is unknown.",
		);
	}

	const nextPath = joinRootAndFolder(rootFolderPath, folderName);
	const moveFiles = shouldMoveProviderFiles(baseMovie.path, nextPath);

	return {
		movieId: baseMovie.id,
		moveFiles,
		payload: buildUpdateRadarrMoviePayload(baseMovie, {
			qualityProfileId,
			rootFolderPath,
			path: nextPath,
			...(monitored === undefined ? {} : { monitored }),
			...(minimumAvailability === undefined ? {} : { minimumAvailability }),
			tags,
		}),
	};
}

function resolveRequiredQualityProfileId(input: {
	value: RadarrQualityProfileId | undefined;
	fallback: RadarrQualityProfileId | undefined;
}): RadarrQualityProfileId {
	const resolvedValue =
		typeof input.value === "number" && Number.isFinite(input.value)
			? input.value
			: input.fallback;

	if (typeof resolvedValue !== "number" || !Number.isFinite(resolvedValue)) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			"Missing Radarr quality profile for update.",
			"Select a Radarr quality profile before updating this movie.",
		);
	}

	return resolvedValue;
}

function resolveRequiredRootFolderPath(input: {
	value: string | undefined;
	fallback: string | undefined;
}): string {
	const resolvedValue = input.value?.trim() || input.fallback?.trim() || "";

	if (!resolvedValue) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			"Missing Radarr root folder for update.",
			"Select a Radarr root folder before updating this movie.",
		);
	}

	return resolvedValue;
}
