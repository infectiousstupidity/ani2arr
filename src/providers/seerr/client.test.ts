/** Tests for Seerr API client transport usage and endpoint paths. */
// src/providers/seerr/client.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTmdbId } from "@/providers/schemas";
import type { ProviderCredentials } from "@/providers/types";
import { SeerrClient } from "./client";

const credentials: ProviderCredentials = {
	url: "https://seerr.example",
	apiKey: "secret",
};

function createClient(): SeerrClient {
	return new SeerrClient({
		hasUrlPermission: async () => true,
	});
}

describe("SeerrClient", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("validates connections through auth/me", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 1 }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(createClient().validateConnection(credentials)).resolves.toEqual({
			ok: true,
		});

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://seerr.example/api/v1/auth/me",
		);
		const request = fetchMock.mock.calls[0]?.[1];
		expect((request?.headers as Headers).get("X-Api-Key")).toBe("secret");
		expect(request?.credentials).toBe("omit");
	});

	it("creates requests through api/v1/request", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 10, status: 1 }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createClient().requestMedia(
				{ mediaType: "movie", mediaId: parseTmdbId(123) },
				credentials,
			),
		).resolves.toEqual({ id: 10, status: 1 });

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://seerr.example/api/v1/request",
		);
		const request = fetchMock.mock.calls[0]?.[1];
		expect(request?.method).toBe("POST");
		expect(request?.body).toBe('{"mediaType":"movie","mediaId":123}');
	});

	it("reads movie status from movie details", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ mediaInfo: { status: 5 } }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createClient().getMediaStatus(
				{ mediaType: "movie", tmdbId: parseTmdbId(123) },
				credentials,
			),
		).resolves.toBe("available");

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://seerr.example/api/v1/movie/123",
		);
	});

	it("reads TV status from TV details", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				Response.json({
					mediaInfo: {
						status: 2,
						requests: [
							{
								status: 2,
								seasons: [{ seasonNumber: 1 }],
							},
						],
					},
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createClient().getMediaStatus(
				{ mediaType: "tv", tmdbId: parseTmdbId(456), seasons: [1] },
				credentials,
			),
		).resolves.toBe("pending");

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://seerr.example/api/v1/tv/456",
		);
	});

	it("searches media through api/v1/search", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockImplementation(() =>
				Promise.resolve(Response.json({
					results: [
						{
							id: 123,
							mediaType: "movie",
							title: "Movie",
						},
					],
				})),
			);
		vi.stubGlobal("fetch", fetchMock);

		await expect(createClient().searchMedia("Movie", credentials)).resolves.toEqual(
			[
				{
					mediaType: "movie",
					tmdbId: parseTmdbId(123),
					title: "Movie",
				},
			],
		);

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://seerr.example/api/v1/search?query=Movie",
		);

		await createClient().searchMedia("one piece", credentials);

		expect(fetchMock.mock.calls[1]?.[0]).toBe(
			"https://seerr.example/api/v1/search?query=one%20piece",
		);
	});

	it("reads narrow media details", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
			Response.json({
				id: 123,
				title: "Movie",
				releaseDate: "2024-01-01",
				mediaInfo: { status: 1 },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createClient().getMediaDetails(
				{ mediaType: "movie", tmdbId: parseTmdbId(123) },
				credentials,
			),
		).resolves.toMatchObject({
			mediaType: "movie",
			tmdbId: parseTmdbId(123),
			title: "Movie",
			year: 2024,
			status: "unknown",
		});

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://seerr.example/api/v1/movie/123",
		);
	});
});
