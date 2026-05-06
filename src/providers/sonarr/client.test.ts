/** Tests for Sonarr provider-domain client mutation transport endpoints. */
// src/providers/sonarr/client.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	parseProviderQualityProfileId,
	parseProviderTagId,
	parseSonarrSeriesId,
	parseTvdbId,
	type ProviderCredentials,
} from "@/providers";
import { SonarrClient } from "./client";
import type { SonarrAddSeriesPayload } from "./add";
import type { SonarrSeries } from "./types";

const credentials: ProviderCredentials = {
	url: "https://sonarr.example",
	apiKey: "secret",
};

const series: SonarrSeries = {
	id: parseSonarrSeriesId(10),
	title: "Existing Series",
	tvdbId: parseTvdbId(123),
	titleSlug: "existing-series",
	qualityProfileId: parseProviderQualityProfileId(2),
	rootFolderPath: "/anime-4k",
	path: "/anime-4k/Existing Series",
	monitored: false,
	monitorNewItems: "all",
	seriesType: "anime",
	seasonFolder: true,
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

function createClient(): SonarrClient {
	return new SonarrClient({ hasUrlPermission: async () => true });
}

describe("SonarrClient mutations", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("looks up catalog series by TVDB ID", async () => {
		const fetchMock = mockJson([
			{
				title: "Wrong Series",
				tvdbId: parseTvdbId(456),
				folder: "Wrong Series",
			},
			{
				title: "Existing Series",
				tvdbId: parseTvdbId(123),
				folder: "Existing Series",
			},
		]);

		await expect(
			createClient().lookupSeriesByTvdbId(parseTvdbId(123), credentials),
		).resolves.toEqual({
			title: "Existing Series",
			tvdbId: parseTvdbId(123),
			folder: "Existing Series",
		});

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://sonarr.example/api/v3/series/lookup?term=tvdb%3A123",
		);
	});

	it("posts add series payloads", async () => {
		const fetchMock = mockJson(series);
		const payload: SonarrAddSeriesPayload = {
			title: "Existing Series",
			tvdbId: parseTvdbId(123),
			folder: "Existing Series",
			qualityProfileId: parseProviderQualityProfileId(2),
			rootFolderPath: "/anime-4k",
			seasonFolder: true,
			monitored: true,
			seriesType: "anime",
			tags: [parseProviderTagId(7)],
			addOptions: {
				monitor: "all",
				searchForMissingEpisodes: true,
				searchForCutoffUnmetEpisodes: false,
			},
		};

		await expect(createClient().addSeries(payload, credentials)).resolves.toEqual(
			series,
		);

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://sonarr.example/api/v3/series",
		);
		const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
		expect(request.method).toBe("POST");
		expect(JSON.parse(String(request.body))).toEqual(payload);
	});

	it("puts full update payloads and applies monitoring actions", async () => {
		const fetchMock = vi.fn<typeof fetch>();
		fetchMock
			.mockResolvedValueOnce(createJsonResponse(series))
			.mockResolvedValueOnce(new Response(null, { status: 200 }))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createClient().updateSeries(series.id, series, credentials, {
				moveFiles: true,
			}),
		).resolves.toEqual(series);
		await createClient().setSeriesMonitorMode(series.id, "all", credentials);
		await createClient().setSeriesMonitorMode(series.id, "none", credentials, {
			monitored: false,
		});

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://sonarr.example/api/v3/series/10?moveFiles=true",
		);
		const updateRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
		expect(updateRequest.method).toBe("PUT");
		expect(JSON.parse(String(updateRequest.body))).toEqual(series);
		expect(fetchMock.mock.calls[1]?.[0]).toBe(
			"https://sonarr.example/api/v3/seasonpass",
		);
		const monitoringRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
		expect(monitoringRequest.method).toBe("POST");
		expect(JSON.parse(String(monitoringRequest.body))).toEqual({
			series: [{ id: series.id }],
			monitoringOptions: { monitor: "all" },
		});
		const unmonitorRequest = fetchMock.mock.calls[2]?.[1] as RequestInit;
		expect(JSON.parse(String(unmonitorRequest.body))).toEqual({
			series: [{ id: series.id, monitored: false }],
			monitoringOptions: { monitor: "none" },
		});
	});
});
