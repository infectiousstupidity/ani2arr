/** Radarr-only update payload resolver for provider library mutations. */
// src/providers/library/radarr-update-resolver.ts

import type { RadarrClient } from "@/providers/clients/radarr.client";
import {
	createError,
	ErrorCode,
	logError,
	normalizeError,
} from "@/shared/errors";
import type { RadarrFormState } from "@/providers/settings/provider-settings.schema";
import type {
	ProviderCredentials,
	RadarrMovie,
	RadarrMovieId,
	TmdbId,
} from "@/providers";
import { buildProviderFolderSlug, joinRootAndSlug } from "./paths";
import {
	resolveMutationTagIds,
	resolveRequiredQualityProfileId,
	resolveRequiredRootFolderPath,
	shouldMoveProviderFiles,
} from "./mutation-helpers";

type ResolveRadarrMovieUpdateInput = {
	api: Pick<
		RadarrClient,
		"getMovieByTmdbId" | "getMovieById" | "getTags" | "createTag"
	>;
	credentials: ProviderCredentials;
	form: RadarrFormState;
	title: string;
	tmdbId: TmdbId;
};

type ResolvedRadarrMovieUpdate = {
	movieId: RadarrMovieId;
	payload: RadarrMovie;
	moveFiles: boolean;
};

export async function resolveRadarrMovieUpdate(
	input: ResolveRadarrMovieUpdateInput,
): Promise<ResolvedRadarrMovieUpdate> {
	const { api, credentials, form, title, tmdbId } = input;

	if (!Number.isFinite(tmdbId)) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			"Missing or invalid TMDB ID for update.",
			"Unable to update this movie because its TMDB ID is unknown.",
		);
	}

	const existing = await api.getMovieByTmdbId(tmdbId, credentials);
	if (!existing) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`Movie with TMDB ID ${tmdbId} not found in Radarr.`,
			"Cannot edit because this movie is not present in your Radarr library.",
		);
	}

	let baseMovie: RadarrMovie = existing;
	try {
		baseMovie = await api.getMovieById(existing.id, credentials);
	} catch (error) {
		const normalized = normalizeError(error);
		logError(normalized, `Ani2arrApi:updateMovie:fetch:${tmdbId}`);
	}

	const qualityProfileId = resolveRequiredQualityProfileId({
		value: form.qualityProfileId,
		fallback: baseMovie.qualityProfileId,
		provider: "radarr",
		entityLabel: "movie",
		actionLabel: "update",
	});

	const rootFolderPath = resolveRequiredRootFolderPath({
		value: form.rootFolderPath,
		fallback: baseMovie.rootFolderPath,
		provider: "radarr",
		entityLabel: "movie",
		actionLabel: "update",
	});

	const tags = await resolveMutationTagIds(
		api,
		credentials,
		form.tags,
		form.freeformTags,
		"radarr",
	);
	const monitored = form.monitored ?? baseMovie.monitored;
	const minimumAvailability =
		form.minimumAvailability ?? baseMovie.minimumAvailability;
	const searchForMovie =
		form.addOptions?.searchForMovie ?? baseMovie.addOptions?.searchForMovie;

	const nextPath = joinRootAndSlug(
		rootFolderPath,
		buildProviderFolderSlug(baseMovie, title),
	);
	const moveFiles = shouldMoveProviderFiles(baseMovie.path, nextPath);

	return {
		movieId: baseMovie.id,
		moveFiles,
		payload: {
			...baseMovie,
			qualityProfileId,
			rootFolderPath,
			path: nextPath,
			...(monitored === undefined ? {} : { monitored }),
			...(minimumAvailability === undefined ? {} : { minimumAvailability }),
			tags,
			addOptions: {
				...baseMovie.addOptions,
				...(searchForMovie === undefined ? {} : { searchForMovie }),
			},
		},
	};
}
