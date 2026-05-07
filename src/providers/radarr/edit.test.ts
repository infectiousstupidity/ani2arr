/** Tests for Radarr edit workflow full-payload updates. */
// src/providers/radarr/edit.test.ts

import { describe, expect, it, vi } from "vitest";
import {
	parseProviderQualityProfileId,
	parseProviderTagId,
	parseRadarrMovieId,
	parseTmdbId,
} from "@/providers";
import { updateRadarrMovie } from "./edit";

const credentials = {
	url: "https://radarr.example.test",
	apiKey: "secret",
};

describe("updateRadarrMovie", () => {
	it("sends a merged full movie payload, moves files when the path changes, and returns the updated movie", async () => {
		const movieId = parseRadarrMovieId(12);
		const tmdbId = parseTmdbId(34);
		const existingMovie = {
			id: movieId,
			title: "Example Movie",
			tmdbId,
			titleSlug: "example-movie",
			qualityProfileId: parseProviderQualityProfileId(56),
			rootFolderPath: "/movies",
			path: "/movies/Example Movie [tmdb-34]",
			monitored: true,
			minimumAvailability: "announced" as const,
			tags: [parseProviderTagId(1)],
			addOptions: {
				searchForMovie: true,
			},
			movieFile: {
				id: 100,
				path: "/movies/Example Movie [tmdb-34]/movie.mkv",
			},
		};
		const updatedMovie = {
			...existingMovie,
			qualityProfileId: parseProviderQualityProfileId(99),
			rootFolderPath: "/movies-4k",
			path: "/movies-4k/Example Movie [tmdb-34]",
			monitored: false,
			minimumAvailability: "released" as const,
			tags: [parseProviderTagId(7)],
		};
		const client = {
			findMovieByTmdbId: vi.fn(async () => existingMovie),
			getMovieById: vi.fn(async () => existingMovie),
			getTags: vi.fn(async () => [{ id: parseProviderTagId(7), label: "Keep" }]),
			createTag: vi.fn(),
			updateMovie: vi.fn(async () => updatedMovie),
		};

		const result = await updateRadarrMovie(
			{
				tmdbId,
				form: {
					rootFolderPath: "/movies-4k",
					qualityProfileId: parseProviderQualityProfileId(99),
					monitored: false,
					minimumAvailability: "released",
					tags: [parseProviderTagId(7)],
					freeformTags: [],
				},
				credentials,
			},
			{ client },
		);

		expect(result).toBe(updatedMovie);
		expect(client.findMovieByTmdbId).toHaveBeenCalledWith(tmdbId, credentials);
		expect(client.getMovieById).toHaveBeenCalledWith(movieId, credentials);
		expect(client.updateMovie).toHaveBeenCalledWith(
			movieId,
			{
				...existingMovie,
				qualityProfileId: parseProviderQualityProfileId(99),
				rootFolderPath: "/movies-4k",
				path: "/movies-4k/Example Movie [tmdb-34]",
				monitored: false,
				minimumAvailability: "released",
				tags: [parseProviderTagId(7)],
			},
			credentials,
			{ moveFiles: true },
		);
	});

	it("uses the full fetched movie and preserves nested relative folders", async () => {
		const movieId = parseRadarrMovieId(12);
		const tmdbId = parseTmdbId(34);
		const shallowMovie = {
			id: movieId,
			title: "Example Movie",
			tmdbId,
			qualityProfileId: parseProviderQualityProfileId(56),
			rootFolderPath: "/movies",
			path: "/movies/Old Folder",
			tags: [],
		};
		const fullMovie = {
			...shallowMovie,
			titleSlug: "example-movie",
			path: "/movies/Anime/Example Movie",
			monitored: true,
			minimumAvailability: "announced" as const,
		};
		const updatedMovie = {
			...fullMovie,
			rootFolderPath: "/movies-4k",
			path: "/movies-4k/Anime/Example Movie",
		};
		const client = {
			findMovieByTmdbId: vi.fn(async () => shallowMovie),
			getMovieById: vi.fn(async () => fullMovie),
			getTags: vi.fn(async () => []),
			createTag: vi.fn(),
			updateMovie: vi.fn(async () => updatedMovie),
		};

		await updateRadarrMovie(
			{
				tmdbId,
				form: {
					rootFolderPath: "/movies-4k",
					freeformTags: [],
				},
				credentials,
			},
			{ client },
		);

		expect(client.updateMovie).toHaveBeenCalledWith(
			movieId,
			{
				...fullMovie,
				rootFolderPath: "/movies-4k",
				path: "/movies-4k/Anime/Example Movie",
				tags: [],
			},
			credentials,
			{ moveFiles: true },
		);
	});

	it("throws before update when the movie is not in the Radarr library", async () => {
		const client = {
			findMovieByTmdbId: vi.fn(async () => null),
			getMovieById: vi.fn(),
			getTags: vi.fn(async () => []),
			createTag: vi.fn(),
			updateMovie: vi.fn(),
		};

		await expect(
			updateRadarrMovie(
				{
					tmdbId: parseTmdbId(34),
					form: {
						rootFolderPath: "/movies",
						qualityProfileId: parseProviderQualityProfileId(99),
						tags: [],
						freeformTags: [],
					},
					credentials,
				},
				{ client },
			),
		).rejects.toMatchObject({
			code: "VALIDATION_ERROR",
		});
		expect(client.getTags).not.toHaveBeenCalled();
		expect(client.updateMovie).not.toHaveBeenCalled();
	});
});
