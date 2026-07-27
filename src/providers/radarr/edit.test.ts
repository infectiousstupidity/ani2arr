/** Tests for Radarr edit workflow full-payload updates. */
import { describe, expect, it, vi } from "vitest";
import type {
	ProviderQualityProfileId,
	ProviderTagId,
	RadarrMovieId,
} from "@/providers/schemas";
import { parseTmdbId } from "@/providers/schemas";
import type { RadarrClient } from "./client";
import { updateRadarrMovie } from "./edit";
import type { RadarrMovie } from "./types";

const credentials = {
	url: "https://radarr.example.test",
	apiKey: "secret",
};
const parseProviderQualityProfileId = (value: number) =>
	value as ProviderQualityProfileId;
const parseProviderTagId = (value: number) => value as ProviderTagId;
const parseRadarrMovieId = (value: number) => value as RadarrMovieId;
const movieId = parseRadarrMovieId(12);
const tmdbId = parseTmdbId(34);

function createMovie(overrides: Partial<RadarrMovie> = {}): RadarrMovie {
	return {
		id: movieId,
		title: "Example Movie",
		tmdbId,
		qualityProfileId: parseProviderQualityProfileId(56),
		rootFolderPath: "/movies",
		path: "/movies/Example Movie [tmdb-34]",
		monitored: true,
		tags: [],
		...overrides,
	};
}

describe("updateRadarrMovie", () => {
	it("sends a merged full movie payload, moves files when the path changes, and returns the updated movie", async () => {
		const existingMovie = createMovie({
			titleSlug: "example-movie",
			minimumAvailability: "announced",
			tags: [parseProviderTagId(1)],
		});
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
			getTags: vi.fn(async () => [
				{ id: parseProviderTagId(7), label: "Keep" },
			]),
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
			{ client: client as unknown as RadarrClient },
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
		const shallowMovie = createMovie({
			path: "/movies/Old Folder",
		});
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
			{ client: client as unknown as RadarrClient },
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
				{ client: client as unknown as RadarrClient },
			),
		).rejects.toMatchObject({
			code: "VALIDATION_ERROR",
		});
		expect(client.getTags).not.toHaveBeenCalled();
		expect(client.updateMovie).not.toHaveBeenCalled();
	});
});
