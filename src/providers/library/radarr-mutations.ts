/** Radarr add and update workflows for provider library mutations. */
// src/providers/library/radarr-mutations.ts

import type { AniListMediaHint } from "@/anilist/schemas/media.schema";
import type {
	AddRadarrMoviePayload,
	RadarrClient,
} from "@/providers/clients/radarr.client";
import type { RadarrFormState } from "@/providers/settings/provider-settings.schema";
import type {
	ProviderCredentials,
	RadarrMovie,
	RadarrMovieId,
	TmdbId,
} from "@/providers";
import {
	createError,
	ErrorCode,
	logError,
	normalizeError,
} from "@/shared/errors";
import { buildProviderFolderSlug, joinRootAndSlug } from "./paths";
import {
	resolveMutationTagIds,
	resolveRequiredQualityProfileId,
	resolveRequiredRootFolderPath,
	shouldMoveProviderFiles,
} from "./mutation-helpers";

type AddRadarrMovieInput = {
	tmdbId: TmdbId;
	title: string;
	metadata?: AniListMediaHint | null;
	form: RadarrFormState;
	defaults: RadarrFormState;
	credentials: ProviderCredentials;
};

type UpdateRadarrMovieInput = {
	tmdbId: TmdbId;
	title: string;
	form: RadarrFormState;
	credentials: ProviderCredentials;
};

type RadarrMutationDeps = {
	client: Pick<
		RadarrClient,
		| "addMovie"
		| "getMovieByTmdbId"
		| "getMovieById"
		| "getTags"
		| "createTag"
		| "updateMovie"
	>;
	cache: {
		addMovieToCache(movie: RadarrMovie): Promise<void>;
	};
};

type ResolveRadarrAddPayloadInput = {
	api: Pick<RadarrClient, "getTags" | "createTag">;
	credentials: ProviderCredentials;
	defaults: RadarrFormState;
	form: RadarrFormState;
	title: string;
	tmdbId: TmdbId;
	year?: number;
};

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

export async function addRadarrMovie(
	input: AddRadarrMovieInput,
	deps: RadarrMutationDeps,
): Promise<RadarrMovie> {
	const { client, cache } = deps;

	const payload = await resolveRadarrAddPayload({
		api: client,
		credentials: input.credentials,
		defaults: input.defaults,
		form: input.form,
		title: input.title,
		tmdbId: input.tmdbId,
		...(typeof input.metadata?.startYear === "number"
			? { year: input.metadata.startYear }
			: {}),
	});

	const created = await client.addMovie(payload, input.credentials);
	await cache.addMovieToCache(created);
	return created;
}

export async function updateRadarrMovie(
	input: UpdateRadarrMovieInput,
	deps: RadarrMutationDeps,
): Promise<RadarrMovie> {
	const { client, cache } = deps;

	const resolvedUpdate = await resolveRadarrMovieUpdate({
		api: client,
		credentials: input.credentials,
		form: input.form,
		title: input.title,
		tmdbId: input.tmdbId,
	});

	const updated = await client.updateMovie(
		resolvedUpdate.movieId,
		resolvedUpdate.payload,
		input.credentials,
		{ moveFiles: resolvedUpdate.moveFiles },
	);

	await cache.addMovieToCache(updated);
	return updated;
}

async function resolveRadarrAddPayload(
	input: ResolveRadarrAddPayloadInput,
): Promise<AddRadarrMoviePayload> {
	const { api, credentials, defaults, form, title, tmdbId, year } = input;
	const searchForMovie =
		form.addOptions?.searchForMovie ?? defaults.addOptions?.searchForMovie;

	const qualityProfileId = resolveRequiredQualityProfileId({
		value: form.qualityProfileId,
		fallback: defaults.qualityProfileId,
		provider: "radarr",
		entityLabel: "movie",
		actionLabel: "add",
	});

	const rootFolderPath = resolveRequiredRootFolderPath({
		value: form.rootFolderPath,
		fallback: defaults.rootFolderPath,
		provider: "radarr",
		entityLabel: "movie",
		actionLabel: "add",
	});

	const tags = await resolveMutationTagIds(
		api,
		credentials,
		form.tags,
		form.freeformTags,
		"radarr",
	);

	return {
		title,
		tmdbId,
		qualityProfileId,
		rootFolderPath,
		...(form.monitored === undefined ? {} : { monitored: form.monitored }),
		...(form.minimumAvailability === undefined
			? {}
			: { minimumAvailability: form.minimumAvailability }),
		tags,
		...(typeof year === "number" ? { year } : {}),
		...(searchForMovie === undefined ? {} : { addOptions: { searchForMovie } }),
	};
}

async function resolveRadarrMovieUpdate(
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
