/** LEGACY: Tests for the legacy Sonarr client metadata response normalization until metadata moves to src/providers/sonarr. */
// src/providers/clients/sonarr.client.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import {
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

});
