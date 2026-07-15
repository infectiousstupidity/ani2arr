/** Tests for AniBridge upstream mapping refresh and storage behavior. */
// src/mapping/upstream.store.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import { sourceIdentityKey } from "@/mapping/source-identity";
import { MAX_ANIBRIDGE_BYTES } from "@/mapping/upstream/anibridge.client";
import {
	clearUpstreamMappings,
	getUniqueAniListIdForSource,
	getUpstreamTargets,
	listSeerrUpstreamTargets,
	refreshUpstreamMappings,
} from "./upstream.store";

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;
const UPSTREAM_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPSTREAM_STORAGE_KEY = "mapping:upstream";

function createAniBridgeResponse(
	body: string,
	headers?: HeadersInit,
): Response {
	return new Response(body, {
		status: 200,
		...(headers ? { headers } : {}),
	});
}

function mockAniBridgeResponse(response: Response): void {
	vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValueOnce(response));
}

describe("refreshUpstreamMappings", () => {
	afterEach(async () => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		await clearUpstreamMappings();
	});

	it("rejects oversized payload", async () => {
		mockAniBridgeResponse(
			createAniBridgeResponse("", {
				"Content-Length": String(MAX_ANIBRIDGE_BYTES + 1),
			}),
		);

		await expect(refreshUpstreamMappings()).rejects.toThrow(
			"AniBridge mappings payload is too large.",
		);
	});

	it("rejects invalid JSON", async () => {
		mockAniBridgeResponse(createAniBridgeResponse("{"));

		await expect(refreshUpstreamMappings()).rejects.toThrow(
			"AniBridge mappings payload is not valid JSON.",
		);
	});

	it("rejects payloads with no valid mappings", async () => {
		mockAniBridgeResponse(createAniBridgeResponse(JSON.stringify({})));

		await expect(refreshUpstreamMappings()).rejects.toThrow(
			"AniBridge mappings payload did not contain valid mappings.",
		);
	});

	it("persists canonical entries alongside legacy projections", async () => {
		mockAniBridgeResponse(
			createAniBridgeResponse(
				JSON.stringify({
					"anidb:1:R": {
						"anilist:1": {},
						"tmdb_movie:300": {},
						"tmdb_show:500:s2": {},
						"tvdb_show:700:s0": {},
					},
				}),
			),
		);

		await refreshUpstreamMappings();

		const stored = await browser.storage.local.get(UPSTREAM_STORAGE_KEY);
		expect(stored[UPSTREAM_STORAGE_KEY]).toMatchObject({
			entries: {
				1: [
					{ kind: "tmdb-movie", id: tmdb(300) },
					{ kind: "tmdb-show", id: tmdb(500), season: 2 },
					{ kind: "tvdb-show", id: tvdb(700), season: 0 },
				],
			},
			mappings: {
				"anilist:1": [
					{ provider: "radarr", providerId: tmdb(300) },
					{ provider: "sonarr", providerId: tvdb(700), season: 0 },
				],
			},
		});
	});

	it("forces a full refresh for fresh legacy snapshots", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				mappings: {
					"anilist:1": [{ provider: "radarr", providerId: tmdb(300) }],
				},
				seerrTargets: {
					"anilist:1": { mediaType: "movie", tmdbId: tmdb(300) },
				},
				aniListCrosswalks: {},
				fetchedAt: Date.now(),
				etag: "legacy-etag",
			},
		});
		const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
			expect(init?.headers).toEqual({});
			return createAniBridgeResponse(
				JSON.stringify({
					"anidb:1:R": {
						"anilist:1": {},
						"tmdb_movie:400": {},
					},
				}),
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		await refreshUpstreamMappings();

		expect(fetchMock).toHaveBeenCalledOnce();
		const stored = await browser.storage.local.get(UPSTREAM_STORAGE_KEY);
		expect(stored[UPSTREAM_STORAGE_KEY]).toMatchObject({
			entries: {
				1: [{ kind: "tmdb-movie", id: tmdb(400) }],
			},
		});
	});

	it("keeps canonical entries after an ETag 304 refresh", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
		const entries = {
			1: [{ kind: "tmdb-movie", id: tmdb(300) }],
		};
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries,
				mappings: {
					"anilist:1": [{ provider: "radarr", providerId: tmdb(300) }],
				},
				seerrTargets: {
					"anilist:1": { mediaType: "movie", tmdbId: tmdb(300) },
				},
				aniListCrosswalks: {},
				fetchedAt: Date.now() - UPSTREAM_REFRESH_INTERVAL_MS - 1,
				etag: "canonical-etag",
			},
		});
		const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
			expect(init?.headers).toEqual({
				"If-None-Match": "canonical-etag",
			});
			return new Response(null, { status: 304 });
		});
		vi.stubGlobal("fetch", fetchMock);

		await refreshUpstreamMappings();

		const stored = await browser.storage.local.get(UPSTREAM_STORAGE_KEY);
		expect(stored[UPSTREAM_STORAGE_KEY]).toMatchObject({
			entries,
			fetchedAt: Date.now(),
			etag: "canonical-etag",
		});
	});

	it("keeps previous stored snapshot when refresh payload is invalid", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
		mockAniBridgeResponse(
			createAniBridgeResponse(
				JSON.stringify({
					"anidb:1:R": {
						"anilist:1": {},
						"tmdb_movie:300": {},
					},
				}),
				{ ETag: "previous-etag" },
			),
		);
		await refreshUpstreamMappings();

		vi.setSystemTime(Date.now() + UPSTREAM_REFRESH_INTERVAL_MS + 1);
		mockAniBridgeResponse(createAniBridgeResponse("{"));

		await expect(refreshUpstreamMappings()).rejects.toThrow(
			"AniBridge mappings payload is not valid JSON.",
		);

		await expect(getUpstreamTargets("radarr", aid(1))).resolves.toEqual([
			{ provider: "radarr", providerId: tmdb(300) },
		]);
		await expect(listSeerrUpstreamTargets([aid(1)])).resolves.toEqual([
			{ anilistId: aid(1), target: { mediaType: "movie", tmdbId: tmdb(300) } },
		]);
	});

	it("normalizes old raw AniList snapshot keys on read", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				mappings: {
					1: [{ provider: "radarr", providerId: tmdb(300) }],
				},
				seerrTargets: {
					1: { mediaType: "movie", tmdbId: tmdb(300) },
				},
				fetchedAt: Date.now(),
			},
		});

		await expect(getUpstreamTargets("radarr", aid(1))).resolves.toEqual([
			{ provider: "radarr", providerId: tmdb(300) },
		]);
		await expect(listSeerrUpstreamTargets([aid(1)])).resolves.toEqual([
			{ anilistId: aid(1), target: { mediaType: "movie", tmdbId: tmdb(300) } },
		]);
	});

	it("ignores legacy MAL-keyed Seerr targets on read", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				mappings: {},
				seerrTargets: {
					[sourceIdentityKey({ source: "anilist", id: aid(21) })]: {
						mediaType: "movie",
						tmdbId: tmdb(300),
					},
					[sourceIdentityKey({ source: "mal", id: mal(5114) })]: {
						mediaType: "movie",
						tmdbId: tmdb(400),
					},
				},
				fetchedAt: Date.now(),
			},
		});

		await expect(listSeerrUpstreamTargets([aid(21)])).resolves.toEqual([
			{ anilistId: aid(21), target: { mediaType: "movie", tmdbId: tmdb(300) } },
		]);
	});

	it("returns unique AniList crosswalks for MAL sources", async () => {
		mockAniBridgeResponse(
			createAniBridgeResponse(
				JSON.stringify({
					"anidb:5114:R": {
						"anilist:21": {},
						"mal:5114": {},
						"tmdb_movie:300": {},
					},
				}),
			),
		);

		await refreshUpstreamMappings();

		await expect(
			getUniqueAniListIdForSource({ source: "mal", id: mal(5114) }),
		).resolves.toBe(aid(21));
	});
});
