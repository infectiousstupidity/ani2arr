/** Tests for Radarr client response normalization. */
// src/providers/clients/radarr.client.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	parseProviderQualityProfileId,
	parseProviderTagId,
	parseRadarrMovieId,
	type ProviderCredentials,
} from "@/providers";
import { RadarrClient } from "./radarr.client";

const credentials: ProviderCredentials = {
	url: "https://radarr.example",
	apiKey: "secret",
};

function createJsonResponse(body: unknown): Response {
	return Response.json(body, {
		headers: { "Content-Type": "application/json" },
	});
}

function mockJson(body: unknown): void {
	vi.stubGlobal(
		"fetch",
		vi.fn<typeof fetch>().mockResolvedValueOnce(createJsonResponse(body)),
	);
}

function mockJsonSequence(...bodies: unknown[]): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn<typeof fetch>();
	for (const body of bodies) {
		fetchMock.mockResolvedValueOnce(createJsonResponse(body));
	}
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function createClient(): RadarrClient {
	return new RadarrClient({ hasUrlPermission: async () => true });
}

describe("RadarrClient response normalization", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("normalizes full movie resources", async () => {
		mockJson([
			{
				id: 20,
				tmdbId: 456,
				title: " ",
				folder: " Movie Folder ",
				tags: null,
				movieFile: {
					id: 99,
					path: " /movies/file.mkv ",
					relativePath: " file.mkv ",
					size: 1000,
					quality: { quality: { name: "HD" } },
				},
				images: [{ coverType: " poster ", remoteUrl: " https://image " }],
			},
		]);

		await expect(createClient().getAllMovies(credentials)).resolves.toEqual([
			{
				id: 20,
				title: "Radarr movie 20",
				tmdbId: 456,
				folderName: "Movie Folder",
				tags: [],
				movieFile: {
					id: 99,
					path: "/movies/file.mkv",
					relativePath: "file.mkv",
					size: 1000,
					quality: { quality: { name: "HD" } },
				},
				images: [{ coverType: "poster", remoteUrl: "https://image" }],
			},
		]);
	});

	it("normalizes lookup resources as smaller lookup movies", async () => {
		mockJson([
			{
				id: 0,
				tmdbId: 789,
				title: " Lookup Movie ",
				qualityProfileId: 12,
				rootFolderPath: "/movies",
				remotePoster: " https://image.example/poster.jpg ",
				folder: " Lookup Folder ",
				hasFile: true,
			},
		]);

		await expect(
			createClient().lookupMovieByTerm("movie", credentials),
		).resolves.toEqual([
			{
				title: "Lookup Movie",
				tmdbId: 789,
				folderName: "Lookup Folder",
				remotePoster: "https://image.example/poster.jpg",
				hasFile: true,
			},
		]);
	});

	it("rejects invalid required branded IDs", async () => {
		mockJson([{ id: 20, tmdbId: 0, title: "Broken" }]);

		await expect(createClient().getAllMovies(credentials)).rejects.toThrow(
			"Invalid TMDB ID",
		);
	});

	it("fetches the raw movie, shallow-merges the patch, puts the full resource, and normalizes the response", async () => {
		const fetchMock = mockJsonSequence(
			{
				id: 20,
				tmdbId: 456,
				title: "Existing Movie",
				titleSlug: "existing-movie",
				qualityProfileId: 1,
				rootFolderPath: "/movies",
				path: "/movies/Existing Movie",
				monitored: true,
				minimumAvailability: "announced",
				movieFile: { id: 99, path: "/movies/file.mkv" },
				customArrField: "preserved",
			},
			{
				id: 20,
				tmdbId: 456,
				title: "Existing Movie",
				titleSlug: "existing-movie",
				qualityProfileId: 2,
				rootFolderPath: "/movies-4k",
				path: "/movies-4k/Existing Movie",
				monitored: false,
				minimumAvailability: "released",
				tags: [7],
			},
		);

		const result = await createClient().updateMovie(
			parseRadarrMovieId(20),
			{
				qualityProfileId: parseProviderQualityProfileId(2),
				rootFolderPath: "/movies-4k",
				path: "/movies-4k/Existing Movie",
				monitored: false,
				minimumAvailability: "released",
				tags: [parseProviderTagId(7)],
			},
			credentials,
			{ moveFiles: true },
		);

		expect(result).toMatchObject({
			id: 20,
			tmdbId: 456,
			qualityProfileId: 2,
			rootFolderPath: "/movies-4k",
			path: "/movies-4k/Existing Movie",
			monitored: false,
			minimumAvailability: "released",
			tags: [7],
		});
		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://radarr.example/api/v3/movie/20",
		);
		expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBeUndefined();
		expect(fetchMock.mock.calls[1]?.[0]).toBe(
			"https://radarr.example/api/v3/movie/20?moveFiles=true",
		);
		expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe("PUT");
		const putOptions = fetchMock.mock.calls[1]?.[1] as RequestInit;
		expect(JSON.parse(String(putOptions.body))).toEqual({
			id: 20,
			tmdbId: 456,
			title: "Existing Movie",
			titleSlug: "existing-movie",
			qualityProfileId: 2,
			rootFolderPath: "/movies-4k",
			path: "/movies-4k/Existing Movie",
			monitored: false,
			minimumAvailability: "released",
			movieFile: { id: 99, path: "/movies/file.mkv" },
			customArrField: "preserved",
			tags: [7],
		});
	});

});
