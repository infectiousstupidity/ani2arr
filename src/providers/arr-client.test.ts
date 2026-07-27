/** Provider-specific endpoint and response contracts for Arr clients. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { RadarrClient } from "./radarr/client";
import type { RadarrAddMoviePayload, RadarrMovie } from "./radarr/types";
import type {
	ProviderQualityProfileId,
	ProviderTagId,
	RadarrMovieId,
	SonarrSeriesId,
} from "./schemas";
import { parseTmdbId, parseTvdbId } from "./schemas";
import { SonarrClient } from "./sonarr/client";
import type { SonarrAddSeriesPayload, SonarrSeries } from "./sonarr/types";
import type { ProviderCredentials } from "./types";

const credentials: ProviderCredentials = {
	url: "https://arr.example",
	apiKey: "secret",
};

const qualityProfileId = 2 as ProviderQualityProfileId;
const tagId = 7 as ProviderTagId;

function json(body: unknown): Response {
	return Response.json(body, {
		headers: { "Content-Type": "application/json" },
	});
}

function stubFetch(...responses: Response[]) {
	const fetchMock = vi.fn<typeof fetch>();
	for (const response of responses) {
		fetchMock.mockResolvedValueOnce(response);
	}
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function createSonarrClient(): SonarrClient {
	return new SonarrClient({
		hasUrlPermission: async () => true,
	});
}

function createRadarrClient(): RadarrClient {
	return new RadarrClient({
		hasUrlPermission: async () => true,
	});
}

const series: SonarrSeries = {
	id: 10 as SonarrSeriesId,
	title: "Existing Series",
	tvdbId: parseTvdbId(123),
	titleSlug: "existing-series",
	qualityProfileId,
	rootFolderPath: "/anime",
	path: "/anime/Existing Series",
	monitored: true,
	monitorNewItems: "all",
	seriesType: "anime",
	seasonFolder: true,
	tags: [tagId],
};

const movie: RadarrMovie = {
	id: 20 as RadarrMovieId,
	tmdbId: parseTmdbId(456),
	title: "Existing Movie",
	titleSlug: "existing-movie",
	qualityProfileId,
	rootFolderPath: "/movies",
	path: "/movies/Existing Movie",
	monitored: true,
	minimumAvailability: "released",
	tags: [tagId],
};

describe("Arr clients", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("uses Sonarr TVDB, add, update, and season-pass endpoints", async () => {
		const addPayload: SonarrAddSeriesPayload = {
			title: series.title,
			tvdbId: series.tvdbId,
			folder: series.title,
			qualityProfileId,
			rootFolderPath: "/anime",
			seasonFolder: true,
			monitored: true,
			seriesType: "anime",
			tags: [tagId],
			addOptions: {
				monitor: "all",
				searchForMissingEpisodes: true,
				searchForCutoffUnmetEpisodes: false,
			},
		};
		const fetchMock = stubFetch(
			json([
				{
					title: "Wrong Series",
					tvdbId: parseTvdbId(456),
					folder: "Wrong Series",
				},
				{
					title: series.title,
					tvdbId: series.tvdbId,
					folder: series.title,
				},
			]),
			json(series),
			json(series),
			new Response(null, { status: 200 }),
		);
		const client = createSonarrClient();

		await expect(
			client.lookupSeriesByTvdbId(series.tvdbId, credentials),
		).resolves.toMatchObject({
			title: series.title,
			tvdbId: series.tvdbId,
		});
		await expect(client.addSeries(addPayload, credentials)).resolves.toEqual(
			series,
		);
		await expect(
			client.updateSeries(series.id, series, credentials, {
				moveFiles: true,
			}),
		).resolves.toEqual(series);
		await client.setSeriesMonitorMode(series.id, "none", credentials, {
			monitored: false,
		});

		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"https://arr.example/api/v3/series/lookup?term=tvdb%3A123",
			"https://arr.example/api/v3/series",
			"https://arr.example/api/v3/series/10?moveFiles=true",
			"https://arr.example/api/v3/seasonpass",
		]);
		expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual(
			addPayload,
		);
		expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual(
			series,
		);
		expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toEqual({
			series: [{ id: series.id, monitored: false }],
			monitoringOptions: { monitor: "none" },
		});
	});

	it("parses Radarr resources and uses TMDB mutation endpoints", async () => {
		const addPayload: RadarrAddMoviePayload = {
			id: 0,
			title: movie.title,
			tmdbId: movie.tmdbId,
			qualityProfileId,
			rootFolderPath: "/movies",
			monitored: true,
			minimumAvailability: "released",
			tags: [tagId],
			addOptions: {
				monitor: "movieOnly",
				searchForMovie: true,
			},
		};
		const fetchMock = stubFetch(
			json([{ ...movie, customArrField: "discarded" }]),
			json({
				id: 0,
				title: "Lookup Movie",
				tmdbId: movie.tmdbId,
			}),
			json(movie),
			json(movie),
		);
		const client = createRadarrClient();

		await expect(client.getAllMovies(credentials)).resolves.toEqual([movie]);
		await expect(
			client.lookupMovieByTmdbId(movie.tmdbId, credentials),
		).resolves.toMatchObject({
			title: "Lookup Movie",
			tmdbId: movie.tmdbId,
		});
		await expect(client.addMovie(addPayload, credentials)).resolves.toEqual(
			movie,
		);
		await expect(
			client.updateMovie(movie.id, movie, credentials, {
				moveFiles: true,
			}),
		).resolves.toEqual(movie);

		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"https://arr.example/api/v3/movie",
			"https://arr.example/api/v3/movie/lookup/tmdb?tmdbId=456",
			"https://arr.example/api/v3/movie",
			"https://arr.example/api/v3/movie/20?moveFiles=true",
		]);
		expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual(
			addPayload,
		);
		expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toEqual(
			movie,
		);
	});

	it("rejects malformed required Radarr resource fields", async () => {
		stubFetch(
			json([
				{
					...movie,
					title: "",
				},
			]),
		);

		await expect(
			createRadarrClient().getAllMovies(credentials),
		).rejects.toThrow();
	});
});
