/** Small Radarr API client for the /api/v3 endpoints ani2arr uses. */
// src/providers/radarr/client.ts

import * as v from "valibot";

import { createError, ErrorCode } from "@/shared/errors";
import { ProviderApiClient } from "../shared.client";
import type { ProviderCredentials } from "../types";
import type { RadarrAddMoviePayload } from "./add";
import {
	RadarrLookupMovieSchema,
	RadarrMovieSchema,
	RadarrQualityProfileSchema,
	RadarrRootFolderSchema,
	RadarrTagSchema,
} from "./schemas";
import type {
	RadarrLookupMovie,
	RadarrMovie,
	RadarrMovieId,
	RadarrQualityProfile,
	RadarrRootFolder,
	RadarrTag,
	TmdbId,
} from "./types";

const RADARR_API_BASE_PATH = "/api/v3";

export class RadarrClient extends ProviderApiClient {
	public constructor(options: {
		hasUrlPermission: (url: string) => Promise<boolean>;
	}) {
		super({
			providerName: "Radarr",
			apiBasePath: RADARR_API_BASE_PATH,
			hasUrlPermission: options.hasUrlPermission,
		});
	}

	public async getAllMovies(
		credentials: ProviderCredentials,
	): Promise<RadarrMovie[]> {
		const json = await this.requestJson("movie", credentials);
		return v.parse(v.array(RadarrMovieSchema), json);
	}

	public async findMovieByTmdbId(
		tmdbId: TmdbId,
		credentials: ProviderCredentials,
	): Promise<RadarrMovie | null> {
		const qs = new URLSearchParams({ tmdbId: String(tmdbId) }).toString();
		const json = await this.requestJson(`movie?${qs}`, credentials);
		const movies = v.parse(v.array(RadarrMovieSchema), json);
		return movies.find((movie) => movie.tmdbId === tmdbId) ?? movies[0] ?? null;
	}

	public async getMovieById(
		movieId: RadarrMovieId,
		credentials: ProviderCredentials,
	): Promise<RadarrMovie> {
		const json = await this.requestJson(`movie/${movieId}`, credentials);
		return v.parse(RadarrMovieSchema, json);
	}

	public async lookupMovies(
		term: string,
		credentials: ProviderCredentials,
	): Promise<RadarrLookupMovie[]> {
		const qs = new URLSearchParams({ term }).toString();
		const json = await this.requestJson(`movie/lookup?${qs}`, credentials);
		return v.parse(v.array(RadarrLookupMovieSchema), json);
	}

	public async lookupMovieByTmdbId(
		tmdbId: TmdbId,
		credentials: ProviderCredentials,
	): Promise<RadarrLookupMovie | null> {
		const qs = new URLSearchParams({ tmdbId: String(tmdbId) }).toString();
		const json = await this.requestJson(`movie/lookup/tmdb?${qs}`, credentials);
		const movie = v.parse(RadarrLookupMovieSchema, json);
		return movie.tmdbId === tmdbId ? movie : null;
	}

	public async addMovie(
		payload: RadarrAddMoviePayload,
		credentials: ProviderCredentials,
	): Promise<RadarrMovie> {
		const json = await this.requestJson("movie", credentials, {
			method: "POST",
			json: payload,
		});
		return v.parse(RadarrMovieSchema, json);
	}

	public async updateMovie(
		movieId: RadarrMovieId,
		payload: RadarrMovie,
		credentials: ProviderCredentials,
		options?: { moveFiles?: boolean },
	): Promise<RadarrMovie> {
		const qs = new URLSearchParams();
		if (options?.moveFiles !== undefined) {
			qs.set("moveFiles", String(options.moveFiles));
		}

		const endpoint =
			qs.size > 0 ? `movie/${movieId}?${qs.toString()}` : `movie/${movieId}`;

		const json = await this.requestJson(endpoint, credentials, {
			method: "PUT",
			json: payload,
		});
		return v.parse(RadarrMovieSchema, json);
	}

	public async getRootFolders(
		credentials: ProviderCredentials,
	): Promise<RadarrRootFolder[]> {
		const json = await this.requestJson("rootfolder", credentials);
		return v.parse(v.array(RadarrRootFolderSchema), json);
	}

	public async getQualityProfiles(
		credentials: ProviderCredentials,
	): Promise<RadarrQualityProfile[]> {
		const json = await this.requestJson("qualityprofile", credentials);
		return v.parse(v.array(RadarrQualityProfileSchema), json);
	}

	public async getTags(credentials: ProviderCredentials): Promise<RadarrTag[]> {
		const json = await this.requestJson("tag", credentials);
		return v.parse(v.array(RadarrTagSchema), json);
	}

	public async createTag(
		label: string,
		credentials: ProviderCredentials,
	): Promise<RadarrTag> {
		const trimmed = label.trim();
		if (!trimmed) {
			throw createError(
				ErrorCode.VALIDATION_ERROR,
				"Tag label is empty.",
				"Tag label cannot be empty.",
			);
		}

		const json = await this.requestJson("tag", credentials, {
			method: "POST",
			json: { label: trimmed },
		});
		return v.parse(RadarrTagSchema, json);
	}
}
