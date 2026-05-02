/** Tests for Sonarr client response normalization. */
// src/providers/clients/sonarr.client.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	parseProviderQualityProfileId,
	parseProviderTagId,
	parseSonarrSeriesId,
	type ProviderCredentials,
} from "@/providers";
import { SonarrClient } from "./sonarr.client";

const credentials: ProviderCredentials = {
	url: "https://sonarr.example",
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

function createClient(): SonarrClient {
	return new SonarrClient({ hasUrlPermission: async () => true });
}

describe("SonarrClient response normalization", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("normalizes full series resources", async () => {
		mockJson([
			{
				id: 10,
				tvdbId: 123,
				title: "  ",
				titleSlug: null,
				alternateTitles: [
					{ title: "  Alt  ", sceneOrigin: "  scene  ", sourceType: null },
				],
				statistics: {
					seasonCount: 2,
					episodeCount: 24,
					episodeFileCount: 12,
					sizeOnDisk: 500,
				},
				rootFolderPath: " /anime ",
				tags: null,
				images: [{ coverType: " poster ", url: " /poster.jpg " }],
			},
		]);

		await expect(createClient().getAllSeries(credentials)).resolves.toEqual([
			{
				id: 10,
				title: "Sonarr series 10",
				tvdbId: 123,
				titleSlug: "tvdb-123",
				alternateTitles: [{ title: "Alt", sourceType: "scene" }],
				seasonCount: 2,
				episodeCount: 24,
				episodeFileCount: 12,
				sizeOnDisk: 500,
				rootFolderPath: "/anime",
				tags: [],
				images: [{ coverType: "poster", url: "/poster.jpg" }],
				statistics: {
					seasonCount: 2,
					episodeCount: 24,
					episodeFileCount: 12,
					sizeOnDisk: 500,
				},
			},
		]);
	});

	it("normalizes lookup resources with optional IDs", async () => {
		mockJson([
			{
				id: 0,
				tvdbId: 456,
				title: null,
				year: 2024,
				network: "  Tokyo MX  ",
				remotePoster: " https://image.example/poster.jpg ",
			},
		]);

		await expect(
			createClient().lookupSeriesByTerm("show", credentials),
		).resolves.toEqual([
			{
				title: "Sonarr series 456",
				tvdbId: 456,
				year: 2024,
				network: "Tokyo MX",
				remotePoster: "https://image.example/poster.jpg",
			},
		]);
	});

	it("filters blank provider metadata", async () => {
		const client = createClient();

		mockJson([
			{ id: 1, path: " /anime ", freeSpace: 100 },
			{ id: 2, path: " ", freeSpace: 200 },
			{ id: 3, path: null },
		]);
		await expect(client.getRootFolders(credentials)).resolves.toEqual([
			{ id: 1, path: "/anime", freeSpace: 100 },
		]);

		mockJson([
			{ id: 4, name: " HD " },
			{ id: 5, name: null },
		]);
		await expect(client.getQualityProfiles(credentials)).resolves.toEqual([
			{ id: 4, name: "HD" },
		]);

		mockJson([
			{ id: 6, label: " anime " },
			{ id: 7, label: " " },
		]);
		await expect(client.getTags(credentials)).resolves.toEqual([
			{ id: 6, label: "anime" },
		]);
	});

	it("rejects invalid required branded IDs", async () => {
		mockJson([{ id: 10, tvdbId: 0, title: "Broken" }]);

		await expect(createClient().getAllSeries(credentials)).rejects.toThrow(
			"Invalid TVDB ID",
		);
	});

	it("fetches the raw series, shallow-merges the patch, puts the full resource, and normalizes the response", async () => {
		const fetchMock = mockJsonSequence(
			{
				id: 10,
				tvdbId: 123,
				title: "Existing Series",
				titleSlug: "existing-series",
				qualityProfileId: 1,
				rootFolderPath: "/anime",
				path: "/anime/Existing Series",
				monitored: true,
				statistics: { episodeCount: 12 },
				customArrField: "preserved",
			},
			{
				id: 10,
				tvdbId: 123,
				title: "Existing Series",
				titleSlug: "existing-series",
				qualityProfileId: 2,
				rootFolderPath: "/anime-4k",
				path: "/anime-4k/Existing Series",
				monitored: false,
				tags: [7],
			},
		);

		const result = await createClient().updateSeries(
			parseSonarrSeriesId(10),
			{
				qualityProfileId: parseProviderQualityProfileId(2),
				rootFolderPath: "/anime-4k",
				path: "/anime-4k/Existing Series",
				monitored: false,
				tags: [parseProviderTagId(7)],
			},
			credentials,
			{ moveFiles: true },
		);

		expect(result).toMatchObject({
			id: 10,
			tvdbId: 123,
			qualityProfileId: 2,
			rootFolderPath: "/anime-4k",
			path: "/anime-4k/Existing Series",
			monitored: false,
			tags: [7],
		});
		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://sonarr.example/api/v3/series/10",
		);
		expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBeUndefined();
		expect(fetchMock.mock.calls[1]?.[0]).toBe(
			"https://sonarr.example/api/v3/series/10?moveFiles=true",
		);
		expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe("PUT");
		const putOptions = fetchMock.mock.calls[1]?.[1] as RequestInit;
		expect(JSON.parse(String(putOptions.body))).toEqual({
			id: 10,
			tvdbId: 123,
			title: "Existing Series",
			titleSlug: "existing-series",
			qualityProfileId: 2,
			rootFolderPath: "/anime-4k",
			path: "/anime-4k/Existing Series",
			monitored: false,
			statistics: { episodeCount: 12 },
			customArrField: "preserved",
			tags: [7],
		});
	});

});
