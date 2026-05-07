/** Tests for Radarr provider-domain client response validation and transport. */
// src/providers/radarr/client.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	parseProviderQualityProfileId,
	parseProviderTagId,
	parseRadarrMovieId,
	parseTmdbId,
	type ProviderCredentials,
} from "@/providers";
import type { RadarrAddMoviePayload } from "./add";
import { RadarrClient } from "./client";
import type { RadarrMovie } from "./types";

const credentials: ProviderCredentials = {
	url: "https://radarr.example",
	apiKey: "secret",
};

const movie: RadarrMovie = {
	id: parseRadarrMovieId(20),
	tmdbId: parseTmdbId(456),
	title: "Existing Movie",
	titleSlug: "existing-movie",
	qualityProfileId: parseProviderQualityProfileId(2),
	rootFolderPath: "/movies-4k",
	path: "/movies-4k/Existing Movie",
	monitored: false,
	minimumAvailability: "released",
	tags: [parseProviderTagId(7)],
};

function createJsonResponse(body: unknown): Response {
	return Response.json(body, {
		headers: { "Content-Type": "application/json" },
	});
}

function mockJson(body: unknown): ReturnType<typeof vi.fn> {
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValueOnce(createJsonResponse(body));
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function createClient(): RadarrClient {
	return new RadarrClient({ hasUrlPermission: async () => true });
}

describe("RadarrClient", () => {
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
				customArrField: "preserved",
			},
		]);

		await expect(createClient().getAllMovies(credentials)).resolves.toEqual([
			{
				id: 20,
				title: "Radarr movie 20",
				tmdbId: 456,
				folder: " Movie Folder ",
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
				customArrField: "preserved",
			},
		]);
	});

	it("normalizes lookup resources without dropping Radarr fields", async () => {
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
				secondaryYearSourceId: 200,
				ratings: { imdb: { value: 8.1 } },
			},
		]);

		await expect(createClient().lookupMovies("movie", credentials)).resolves.toEqual(
			[
				{
					id: 0,
					title: "Lookup Movie",
					tmdbId: 789,
					folder: " Lookup Folder ",
					folderName: "Lookup Folder",
					remotePoster: "https://image.example/poster.jpg",
					hasFile: true,
					qualityProfileId: 12,
					rootFolderPath: "/movies",
					secondaryYearSourceId: 200,
					ratings: { imdb: { value: 8.1 } },
				},
			],
		);
	});

	it("rejects invalid required branded IDs", async () => {
		mockJson([{ id: 20, tmdbId: 0, title: "Broken" }]);

		await expect(createClient().getAllMovies(credentials)).rejects.toThrow(
			"Invalid TMDB ID",
		);
	});

	it("looks up movies by TMDB ID", async () => {
		const fetchMock = vi.fn<typeof fetch>();
		fetchMock.mockResolvedValueOnce(
			createJsonResponse({
				id: 0,
				title: "TMDB Movie",
				tmdbId: 456,
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createClient().lookupMovieByTmdbId(parseTmdbId(456), credentials),
		).resolves.toMatchObject({ title: "TMDB Movie", tmdbId: 456 });

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://radarr.example/api/v3/movie/lookup/tmdb?tmdbId=456",
		);
	});

	it("posts add movie payloads with Radarr defaults", async () => {
		const fetchMock = mockJson(movie);
		const payload: RadarrAddMoviePayload = {
			id: 0,
			title: "Existing Movie",
			tmdbId: parseTmdbId(456),
			qualityProfileId: parseProviderQualityProfileId(2),
			rootFolderPath: "/movies-4k",
			monitored: true,
			minimumAvailability: "released",
			tags: [parseProviderTagId(7)],
			addOptions: { monitor: "movieOnly", searchForMovie: true },
		};

		await expect(createClient().addMovie(payload, credentials)).resolves.toEqual(
			movie,
		);

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://radarr.example/api/v3/movie",
		);
		const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
		expect(request.method).toBe("POST");
		expect(JSON.parse(String(request.body))).toEqual({
			...payload,
			addOptions: { monitor: "movieOnly", searchForMovie: true },
		});
	});

	it("puts full movie payloads with move-file options", async () => {
		const fetchMock = mockJson(movie);

		await expect(
			createClient().updateMovie(movie.id, movie, credentials, {
				moveFiles: true,
			}),
		).resolves.toEqual(movie);

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://radarr.example/api/v3/movie/20?moveFiles=true",
		);
		const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
		expect(request.method).toBe("PUT");
		expect(JSON.parse(String(request.body))).toEqual(movie);
	});

	it("creates trimmed tags", async () => {
		const fetchMock = mockJson({ id: 10, label: "anime" });

		await expect(createClient().createTag(" anime ", credentials)).resolves.toEqual(
			{
				id: 10,
				label: "anime",
			},
		);

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://radarr.example/api/v3/tag",
		);
		const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
		expect(request.method).toBe("POST");
		expect(JSON.parse(String(request.body))).toEqual({ label: "anime" });
	});
});
