/** Radarr add workflow and payload helpers for save-time movie creation. */
// src/providers/radarr/add.ts

import { createError, ErrorCode } from "@/shared/errors";
import type { ProviderCredentials } from "../types";
import type { RadarrClient } from "./client";
import type { RadarrFormState } from "./form-state";
import type { RadarrMinimumAvailability } from "./schemas";
import type {
	RadarrLookupMovie,
	RadarrMovie,
	RadarrQualityProfileId,
	RadarrTagId,
	TmdbId,
} from "./types";
import { resolveRadarrTagIds } from "./tags";

export type RadarrAddMoviePayload = {
	rootFolderPath: string;
	qualityProfileId: RadarrQualityProfileId;
	monitored: boolean;
	minimumAvailability: RadarrMinimumAvailability;
	tags: RadarrTagId[];
	addOptions: { searchForMovie: boolean };
} & RadarrLookupMovie;

type AddRadarrMovieInput = {
	tmdbId: TmdbId;
	form: RadarrFormState;
	defaults: RadarrFormState;
	credentials: ProviderCredentials;
};

type AddRadarrMovieDeps = {
	client: Pick<
		RadarrClient,
		"lookupMovieByTmdbId" | "addMovie" | "getTags" | "createTag"
	>;
};

export function buildAddRadarrMoviePayload(
	movie: RadarrLookupMovie,
	options: {
		rootFolderPath: string;
		qualityProfileId: RadarrQualityProfileId;
		monitored: boolean;
		minimumAvailability: RadarrMinimumAvailability;
		searchForMovie: boolean;
		tags: RadarrTagId[];
	},
): RadarrAddMoviePayload {
	return {
		...movie,
		rootFolderPath: options.rootFolderPath,
		qualityProfileId: options.qualityProfileId,
		monitored: options.monitored,
		minimumAvailability: options.minimumAvailability,
		tags: options.tags,
		addOptions: {
			searchForMovie: options.searchForMovie,
		},
	};
}

export async function addRadarrMovie(
	input: AddRadarrMovieInput,
	deps: AddRadarrMovieDeps,
): Promise<RadarrMovie> {
	const payload = await resolveRadarrAddPayload({
		api: deps.client,
		credentials: input.credentials,
		defaults: input.defaults,
		form: input.form,
		tmdbId: input.tmdbId,
	});

	return deps.client.addMovie(payload, input.credentials);
}

async function resolveRadarrAddPayload(input: {
	api: Pick<RadarrClient, "lookupMovieByTmdbId" | "getTags" | "createTag">;
	credentials: ProviderCredentials;
	defaults: RadarrFormState;
	form: RadarrFormState;
	tmdbId: TmdbId;
}): Promise<RadarrAddMoviePayload> {
	const { api, credentials, defaults, form, tmdbId } = input;
	const qualityProfileId = resolveRequiredQualityProfileId({
		value: form.qualityProfileId,
		fallback: defaults.qualityProfileId,
		actionLabel: "add",
	});
	const rootFolderPath = resolveRequiredRootFolderPath({
		value: form.rootFolderPath,
		fallback: defaults.rootFolderPath,
		actionLabel: "add",
	});
	const monitored = resolveRequiredBoolean({
		value: form.monitored,
		fallback: defaults.monitored,
		fieldLabel: "monitor setting",
		userMessage: "Select whether Radarr should monitor this movie before adding it.",
	});
	const minimumAvailability =
		form.minimumAvailability ?? defaults.minimumAvailability;
	if (!minimumAvailability) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			"Missing Radarr minimum availability for add.",
			"Select a Radarr minimum availability before adding this movie.",
		);
	}

	const searchForMovie = resolveRequiredBoolean({
		value: form.addOptions?.searchForMovie,
		fallback: defaults.addOptions?.searchForMovie,
		fieldLabel: "search setting",
		userMessage: "Select whether Radarr should search after adding this movie.",
	});

	const movie = await api.lookupMovieByTmdbId(tmdbId, credentials);
	if (!movie) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`Radarr lookup did not return a movie for TMDB ID ${tmdbId}.`,
			"Radarr could not find this movie in its lookup catalog.",
			{ tmdbId },
		);
	}

	const tags = await resolveRadarrTagIds({
		api,
		credentials,
		existingIdsFromForm: form.tags,
		freeformLabelsFromForm: form.freeformTags,
	});

	return buildAddRadarrMoviePayload(movie, {
		qualityProfileId,
		rootFolderPath,
		monitored,
		minimumAvailability,
		searchForMovie,
		tags,
	});
}

function resolveRequiredQualityProfileId(input: {
	value: RadarrQualityProfileId | undefined;
	fallback: RadarrQualityProfileId | undefined;
	actionLabel: "add";
}): RadarrQualityProfileId {
	const resolvedValue =
		typeof input.value === "number" && Number.isFinite(input.value)
			? input.value
			: input.fallback;

	if (typeof resolvedValue !== "number" || !Number.isFinite(resolvedValue)) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`Missing Radarr quality profile for ${input.actionLabel}.`,
			"Select a Radarr quality profile before adding this movie.",
		);
	}

	return resolvedValue;
}

function resolveRequiredRootFolderPath(input: {
	value: string | undefined;
	fallback: string | undefined;
	actionLabel: "add";
}): string {
	const resolvedValue = input.value?.trim() || input.fallback?.trim() || "";

	if (!resolvedValue) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`Missing Radarr root folder for ${input.actionLabel}.`,
			"Select a Radarr root folder before adding this movie.",
		);
	}

	return resolvedValue;
}

function resolveRequiredBoolean(input: {
	value: boolean | undefined;
	fallback: boolean | undefined;
	fieldLabel: string;
	userMessage: string;
}): boolean {
	const resolvedValue =
		typeof input.value === "boolean" ? input.value : input.fallback;

	if (typeof resolvedValue !== "boolean") {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`Missing Radarr ${input.fieldLabel} for add.`,
			input.userMessage,
		);
	}

	return resolvedValue;
}
