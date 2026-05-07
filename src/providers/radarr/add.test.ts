/** Tests for Radarr add workflow payload building and save-time tag resolution. */
// src/providers/radarr/add.test.ts

import { describe, expect, it, vi } from "vitest";
import {
	parseProviderQualityProfileId,
	parseProviderTagId,
	parseRadarrMovieId,
	parseTmdbId,
} from "@/providers";
import { addRadarrMovie } from "./add";

const credentials = {
	url: "https://radarr.example.test",
	apiKey: "secret",
};

describe("addRadarrMovie", () => {
	it("looks up the movie by TMDB, builds the add payload, resolves tags, and returns the created movie", async () => {
		const tmdbId = parseTmdbId(34);
		const lookupMovie = {
			title: "Lookup Movie",
			tmdbId,
			imdbId: "tt0034",
			titleSlug: "lookup-movie",
			year: 2025,
			remotePoster: "https://image.example/poster.jpg",
		};
		const createdMovie = {
			id: parseRadarrMovieId(12),
			...lookupMovie,
			qualityProfileId: parseProviderQualityProfileId(99),
			rootFolderPath: "/movies",
			path: "/movies/Lookup Movie [tmdb-34]",
			monitored: true,
			minimumAvailability: "released" as const,
			tags: [parseProviderTagId(7), parseProviderTagId(8)],
		};
		const client = {
			lookupMovieByTmdbId: vi.fn(async () => lookupMovie),
			addMovie: vi.fn(async () => createdMovie),
			getTags: vi.fn(async () => [{ id: parseProviderTagId(7), label: "Keep" }]),
			createTag: vi.fn(async () => ({
				id: parseProviderTagId(8),
				label: "new-tag",
			})),
		};

		const result = await addRadarrMovie(
			{
				tmdbId,
				form: {
					rootFolderPath: "/movies",
					qualityProfileId: parseProviderQualityProfileId(99),
					monitored: true,
					minimumAvailability: "released",
					tags: [parseProviderTagId(7)],
					freeformTags: ["New Tag"],
					addOptions: {
						searchForMovie: false,
					},
				},
				defaults: { freeformTags: [] },
				credentials,
			},
			{ client },
		);

		expect(result).toBe(createdMovie);
		expect(client.lookupMovieByTmdbId).toHaveBeenCalledWith(tmdbId, credentials);
		expect(client.createTag).toHaveBeenCalledWith("new-tag", credentials);
		expect(client.addMovie).toHaveBeenCalledWith(
			{
				...lookupMovie,
				qualityProfileId: parseProviderQualityProfileId(99),
				rootFolderPath: "/movies",
				monitored: true,
				minimumAvailability: "released",
				tags: [parseProviderTagId(7), parseProviderTagId(8)],
				addOptions: {
					searchForMovie: false,
				},
			},
			credentials,
		);
	});

	it("does not resolve tags or add when Radarr lookup has no matching TMDB result", async () => {
		const client = {
			lookupMovieByTmdbId: vi.fn(async () => null),
			addMovie: vi.fn(),
			getTags: vi.fn(async () => []),
			createTag: vi.fn(),
		};

		await expect(
			addRadarrMovie(
				{
					tmdbId: parseTmdbId(34),
					form: {
						rootFolderPath: "/movies",
						qualityProfileId: parseProviderQualityProfileId(99),
						monitored: true,
						minimumAvailability: "released",
						tags: [],
						freeformTags: ["New Tag"],
						addOptions: {
							searchForMovie: true,
						},
					},
					defaults: { freeformTags: [] },
					credentials,
				},
				{ client },
			),
		).rejects.toMatchObject({
			code: "VALIDATION_ERROR",
		});
		expect(client.getTags).not.toHaveBeenCalled();
		expect(client.createTag).not.toHaveBeenCalled();
		expect(client.addMovie).not.toHaveBeenCalled();
	});

	it("does not look up, resolve tags, or add when required add fields are missing", async () => {
		const client = {
			lookupMovieByTmdbId: vi.fn(async () => null),
			addMovie: vi.fn(),
			getTags: vi.fn(async () => []),
			createTag: vi.fn(),
		};

		await expect(
			addRadarrMovie(
				{
					tmdbId: parseTmdbId(34),
					form: {
						rootFolderPath: "/movies",
						qualityProfileId: parseProviderQualityProfileId(99),
						tags: [],
						freeformTags: ["New Tag"],
					},
					defaults: { freeformTags: [] },
					credentials,
				},
				{ client },
			),
		).rejects.toMatchObject({
			code: "VALIDATION_ERROR",
		});
		expect(client.lookupMovieByTmdbId).not.toHaveBeenCalled();
		expect(client.getTags).not.toHaveBeenCalled();
		expect(client.createTag).not.toHaveBeenCalled();
		expect(client.addMovie).not.toHaveBeenCalled();
	});
});
