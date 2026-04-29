/** Radarr transport client for raw Arr API requests and mutations. */
// src/providers/clients/radarr.client.ts

import * as v from "valibot";
import { BaseProviderClient } from "./base-provider.client";
import { createError, ErrorCode } from "@/shared/errors";
import type { RadarrMinimumAvailability } from "@/providers/settings/provider-settings.schema";
import {
	toProviderQualityProfiles,
	toProviderRootFolders,
	toProviderTags,
} from "@/providers/adapters/provider-metadata.adapter";
import {
	toRadarrLookupMovie,
	toRadarrMovie,
} from "@/providers/adapters/radarr.adapter";
import {
	ProviderQualityProfileApiArraySchema,
	ProviderRootFolderApiArraySchema,
	ProviderTagApiArraySchema,
	ProviderTagApiSchema,
} from "@/providers/schemas/provider-shared.schemas";
import {
	RadarrMovieApiArraySchema,
	RadarrMovieApiSchema,
	type RadarrMovieApi,
} from "@/providers/schemas/radarr.schemas";
import type {
	ProviderQualityProfile,
	ProviderRootFolder,
	ProviderTag,
	RadarrLookupMovie,
	RadarrMovie,
	ProviderCredentials,
	ProviderQualityProfileId,
	ProviderTagId,
	RadarrMovieId,
	TmdbId,
} from "@/providers";

type RadarrClientOptions = {
	hasUrlPermission: (url: string) => Promise<boolean>;
};

const RadarrMovieApiSingleOrArraySchema = v.union([
	RadarrMovieApiSchema,
	RadarrMovieApiArraySchema,
]);

export interface AddRadarrMoviePayload {
	title: string;
	tmdbId: TmdbId;
	qualityProfileId: ProviderQualityProfileId;
	rootFolderPath: string;
	monitored?: boolean;
	minimumAvailability?: RadarrMinimumAvailability;
	tags?: ProviderTagId[];
	path?: string;
	year?: number;
	imdbId?: string | null;
	addOptions?: {
		searchForMovie?: boolean;
	};
}

export class RadarrClient extends BaseProviderClient {
	public constructor(options: RadarrClientOptions) {
		super({
			providerName: "Radarr",
			logScope: "RadarrClient",
			cacheableEndpoints: ["movie", "qualityprofile", "rootfolder", "tag"],
			hasUrlPermission: options.hasUrlPermission,
		});
	}

	public getAllMovies = async (
		credentials: ProviderCredentials,
	): Promise<RadarrMovie[]> => {
		const movies = await this.requestParsed(
			"movie",
			credentials,
			RadarrMovieApiArraySchema,
		);
		return movies.map((movie) => toRadarrMovie(movie));
	};

	public getMovieById = async (
		movieId: RadarrMovieId,
		credentials: ProviderCredentials,
	): Promise<RadarrMovie> => {
		const movie = await this.requestParsed(
			`movie/${movieId}`,
			credentials,
			RadarrMovieApiSchema,
		);
		return toRadarrMovie(movie);
	};

	public getMovieByTmdbId = async (
		tmdbId: TmdbId,
		credentials: ProviderCredentials,
	): Promise<RadarrMovie | null> => {
		const qs = new URLSearchParams({ tmdbId: String(tmdbId) }).toString();
		const result = await this.requestParsed(
			`movie?${qs}`,
			credentials,
			RadarrMovieApiSingleOrArraySchema,
		);
		const movie = this.pickSingleMovie(result, tmdbId);
		return movie ? toRadarrMovie(movie) : null;
	};

	public lookupMovieByTerm = async (
		term: string,
		credentials: ProviderCredentials,
	): Promise<RadarrLookupMovie[]> => {
		const qs = new URLSearchParams({ term }).toString();
		const movies = await this.requestParsed(
			`movie/lookup?${qs}`,
			credentials,
			RadarrMovieApiArraySchema,
		);
		return movies.map((movie) => toRadarrLookupMovie(movie));
	};

	public lookupMovieByTmdbId = async (
		tmdbId: TmdbId,
		credentials: ProviderCredentials,
	): Promise<RadarrLookupMovie | null> => {
		const qs = new URLSearchParams({ tmdbId: String(tmdbId) }).toString();
		const result = await this.requestParsed(
			`movie/lookup/tmdb?${qs}`,
			credentials,
			RadarrMovieApiSingleOrArraySchema,
		);
		const movie = this.pickSingleMovie(
			result,
			(movie) => movie.tmdbId === tmdbId,
		);
		return movie ? toRadarrLookupMovie(movie) : null;
	};

	public lookupMovieByImdbId = async (
		imdbId: string,
		credentials: ProviderCredentials,
	): Promise<RadarrLookupMovie | null> => {
		const trimmed = imdbId.trim();
		if (!trimmed) {
			throw createError(
				ErrorCode.VALIDATION_ERROR,
				"IMDb ID is empty.",
				"IMDb ID cannot be empty.",
			);
		}

		const qs = new URLSearchParams({ imdbId: trimmed }).toString();
		const result = await this.requestParsed(
			`movie/lookup/imdb?${qs}`,
			credentials,
			RadarrMovieApiSingleOrArraySchema,
		);
		const movie = this.pickSingleMovie(
			result,
			(movie) => movie.imdbId === trimmed,
		);
		return movie ? toRadarrLookupMovie(movie) : null;
	};

	public getRootFolders = async (
		credentials: ProviderCredentials,
	): Promise<ProviderRootFolder[]> => {
		const rootFolders = await this.requestParsed(
			"rootfolder",
			credentials,
			ProviderRootFolderApiArraySchema,
		);
		return toProviderRootFolders(rootFolders);
	};

	public getQualityProfiles = async (
		credentials: ProviderCredentials,
	): Promise<ProviderQualityProfile[]> => {
		const qualityProfiles = await this.requestParsed(
			"qualityprofile",
			credentials,
			ProviderQualityProfileApiArraySchema,
		);
		return toProviderQualityProfiles(qualityProfiles);
	};

	public getTags = async (
		credentials: ProviderCredentials,
	): Promise<ProviderTag[]> => {
		const tags = await this.requestParsed(
			"tag",
			credentials,
			ProviderTagApiArraySchema,
		);
		return toProviderTags(tags);
	};

	public createTag = async (
		credentials: ProviderCredentials,
		label: string,
	): Promise<ProviderTag> => {
		const trimmed = label.trim();
		if (!trimmed) {
			throw createError(
				ErrorCode.VALIDATION_ERROR,
				"Tag label is empty.",
				"Tag label cannot be empty.",
			);
		}

		const created = await this.requestParsed(
			"tag",
			credentials,
			ProviderTagApiSchema,
			{
				method: "POST",
				body: JSON.stringify({ label: trimmed }),
			},
		);

		this.invalidateCachedEndpoint("tag");

		const [tag] = toProviderTags([created]);
		if (!tag) {
			throw createError(
				ErrorCode.API_ERROR,
				"Radarr returned an invalid tag after creation.",
				"Radarr returned an invalid tag response.",
			);
		}

		return tag;
	};

	public addMovie = async (
		payload: AddRadarrMoviePayload,
		credentials: ProviderCredentials,
	): Promise<RadarrMovie> => {
		const {
			addOptions,
			monitored = true,
			minimumAvailability = "released",
			...rest
		} = payload;

		const apiPayload = {
			...rest,
			monitored,
			minimumAvailability,
			tags: payload.tags ?? [],
			addOptions: {
				searchForMovie: addOptions?.searchForMovie ?? true,
			},
		};

		this.log.debug("Sending addMovie payload to Radarr:", apiPayload);
		const created = await this.requestParsed(
			"movie",
			credentials,
			RadarrMovieApiSchema,
			{
				method: "POST",
				body: JSON.stringify(apiPayload),
			},
		);

		this.invalidateCachedEndpoint("movie");

		return toRadarrMovie(created);
	};

	public updateMovie = async (
		movieId: RadarrMovieId,
		payload: RadarrMovie,
		credentials: ProviderCredentials,
		options?: { moveFiles?: boolean },
	): Promise<RadarrMovie> => {
		const qs = new URLSearchParams();
		if (options?.moveFiles) {
			qs.set("moveFiles", "true");
		}
		const endpoint =
			qs.size > 0 ? `movie/${movieId}?${qs.toString()}` : `movie/${movieId}`;

		this.log.debug("Sending updateMovie payload to Radarr:", {
			movieId,
			moveFiles: options?.moveFiles,
			payload,
		});

		const updated = await this.requestParsed(
			endpoint,
			credentials,
			RadarrMovieApiSchema,
			{
				method: "PUT",
				body: JSON.stringify(payload),
			},
		);

		this.invalidateCachedEndpoint("movie");

		return toRadarrMovie(updated);
	};

	private pickSingleMovie(
		result: RadarrMovieApi | RadarrMovieApi[],
		tmdbIdOrPredicate: TmdbId | ((movie: RadarrMovieApi) => boolean),
	): RadarrMovieApi | null {
		const predicate =
			typeof tmdbIdOrPredicate === "number"
				? (movie: RadarrMovieApi) => movie.tmdbId === tmdbIdOrPredicate
				: tmdbIdOrPredicate;

		if (Array.isArray(result)) {
			return result.find((movie) => predicate(movie)) ?? result[0] ?? null;
		}

		return result ?? null;
	}
}
