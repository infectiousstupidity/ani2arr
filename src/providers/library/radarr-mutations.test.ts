/** Tests for Radarr add and update mutation workflows. */
// src/providers/library/radarr-mutations.test.ts

import { describe, expect, it, vi } from "vitest";
import {
	parseProviderQualityProfileId,
	parseProviderTagId,
	parseRadarrMovieId,
	parseTmdbId,
} from "@/providers";
import { addRadarrMovie, updateRadarrMovie } from "./radarr-mutations";

const credentials = {
	url: "https://radarr.example.test",
	apiKey: "secret",
};

describe("addRadarrMovie", () => {
	it("uses the supplied TMDB ID, adds the movie, and updates the cache", async () => {
		const tmdbId = parseTmdbId(34);
		const createdMovie = {
			id: parseRadarrMovieId(12),
			title: "Example Movie",
			tmdbId,
			titleSlug: "example-movie",
			qualityProfileId: parseProviderQualityProfileId(99),
			rootFolderPath: "/movies",
			path: "/movies/Example Movie [tmdb-34]",
			monitored: true,
			minimumAvailability: "released" as const,
			tags: [parseProviderTagId(7)],
			addOptions: {
				searchForMovie: false,
			},
		};
		const client = {
			addMovie: vi.fn(async () => createdMovie),
			getMovieByTmdbId: vi.fn(),
			getMovieById: vi.fn(),
			getTags: vi.fn(async () => [{ id: parseProviderTagId(7), label: "Keep" }]),
			createTag: vi.fn(),
			updateMovie: vi.fn(),
		};
		const cache = {
			addMovieToCache: vi.fn(async () => {}),
		};

		const result = await addRadarrMovie(
			{
				tmdbId,
				title: "Example Movie",
				metadata: { startYear: 2025 },
				form: {
					rootFolderPath: "/movies",
					qualityProfileId: parseProviderQualityProfileId(99),
					monitored: true,
					minimumAvailability: "released",
					tags: [parseProviderTagId(7)],
					freeformTags: [],
					addOptions: {
						searchForMovie: false,
					},
				},
				defaults: { freeformTags: [] },
				credentials,
			},
			{ client, cache },
		);

		expect(result).toBe(createdMovie);
		expect(client.addMovie).toHaveBeenCalledWith(
			{
				title: "Example Movie",
				tmdbId,
				qualityProfileId: parseProviderQualityProfileId(99),
				rootFolderPath: "/movies",
				monitored: true,
				minimumAvailability: "released",
				tags: [parseProviderTagId(7)],
				year: 2025,
				addOptions: {
					searchForMovie: false,
				},
			},
			credentials,
		);
		expect(cache.addMovieToCache).toHaveBeenCalledWith(createdMovie);
	});
});

describe("updateRadarrMovie", () => {
	it("merges the form with the existing movie, moves files when the path changes, and updates the cache", async () => {
		const movieId = parseRadarrMovieId(12);
		const tmdbId = parseTmdbId(34);
		const updatedMovie = {
			id: movieId,
			title: "Example Movie",
			tmdbId,
			titleSlug: "example-movie",
			qualityProfileId: parseProviderQualityProfileId(99),
			rootFolderPath: "/movies-4k",
			path: "/movies-4k/Example Movie [tmdb-34]",
			monitored: false,
			minimumAvailability: "released" as const,
			tags: [parseProviderTagId(7)],
			addOptions: {
				searchForMovie: false,
			},
		};
		const existingMovie = {
			id: movieId,
			title: "Example Movie",
			tmdbId,
			qualityProfileId: parseProviderQualityProfileId(56),
			rootFolderPath: "/movies",
			path: "/movies/Example Movie [tmdb-34]",
			monitored: true,
			minimumAvailability: "announced" as const,
			tags: [parseProviderTagId(1)],
			addOptions: {
				searchForMovie: true,
			},
		};
		const client = {
			addMovie: vi.fn(),
			getMovieByTmdbId: vi.fn(async () => existingMovie),
			getMovieById: vi.fn(async () => existingMovie),
			getTags: vi.fn(async () => [{ id: parseProviderTagId(7), label: "Keep" }]),
			createTag: vi.fn(),
			updateMovie: vi.fn(async () => updatedMovie),
		};
		const cache = {
			addMovieToCache: vi.fn(async () => {}),
		};

		const result = await updateRadarrMovie(
			{
				tmdbId,
				title: "Example Movie",
				form: {
					rootFolderPath: "/movies-4k",
					qualityProfileId: parseProviderQualityProfileId(99),
					monitored: false,
					minimumAvailability: "released",
					tags: [parseProviderTagId(7)],
					freeformTags: [],
					addOptions: {
						searchForMovie: false,
					},
				},
				credentials,
			},
			{ client, cache },
		);

		expect(result).toBe(updatedMovie);
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
				addOptions: {
					searchForMovie: false,
				},
			},
			credentials,
			{ moveFiles: true },
		);
		expect(cache.addMovieToCache).toHaveBeenCalledWith(updatedMovie);
	});
});
