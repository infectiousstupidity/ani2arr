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
	listAllSeerrUpstreamTargets,
	listSeerrUpstreamTargets,
	listSourceUpstreamMappings,
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

	it("persists only canonical entries and refresh metadata", async () => {
		mockAniBridgeResponse(
			createAniBridgeResponse(
				JSON.stringify({
					"anilist:1": {
						"tmdb_movie:300": {},
						"tmdb_show:500:s2": {},
						"tvdb_show:700:s0": {},
					},
				}),
			),
		);

		await refreshUpstreamMappings();

		const stored = await browser.storage.local.get(UPSTREAM_STORAGE_KEY);
		expect(stored[UPSTREAM_STORAGE_KEY]).toEqual({
			entries: {
				1: [
					{ kind: "tmdb-movie", id: tmdb(300) },
					{ kind: "tmdb-show", id: tmdb(500), season: 2 },
					{ kind: "tvdb-show", id: tvdb(700), season: 0 },
				],
			},
			aniListCrosswalks: {},
			fetchedAt: expect.any(Number),
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
					"anilist:1": {
						"tmdb_movie:400": {},
					},
				}),
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		await refreshUpstreamMappings();

		expect(fetchMock).toHaveBeenCalledOnce();
		const stored = await browser.storage.local.get(UPSTREAM_STORAGE_KEY);
		expect(stored[UPSTREAM_STORAGE_KEY]).toEqual({
			entries: {
				1: [{ kind: "tmdb-movie", id: tmdb(400) }],
			},
			aniListCrosswalks: {},
			fetchedAt: expect.any(Number),
		});
		await expect(getUpstreamTargets("radarr", aid(1))).resolves.toEqual([
			{ provider: "radarr", providerId: tmdb(400) },
		]);
	});

	it("refreshes canonical snapshot metadata after an ETag 304", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
		const entries = {
			1: [{ kind: "tmdb-movie", id: tmdb(300) }],
		};
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries,
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
		expect(stored[UPSTREAM_STORAGE_KEY]).toEqual({
			entries,
			aniListCrosswalks: {},
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
					"anilist:1": {
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

	it("normalizes Arr targets by provider ID", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					1: [{ kind: "tvdb-show", id: tvdb(700), season: 1 }],
					2: [
						{ kind: "tvdb-show", id: tvdb(81_797), season: 0 },
						{ kind: "tvdb-show", id: tvdb(81_797), season: 1 },
						{ kind: "tvdb-show", id: tvdb(81_797), season: 2 },
					],
					3: [
						{ kind: "tvdb-show", id: tvdb(100), season: 1 },
						{ kind: "tvdb-show", id: tvdb(200), season: 2 },
					],
					4: [
						{ kind: "tmdb-movie", id: tmdb(300) },
						{ kind: "tmdb-movie", id: tmdb(400) },
					],
				},
				aniListCrosswalks: {},
				fetchedAt: Date.now(),
			},
		});

		await expect(
			Promise.all([
				getUpstreamTargets("sonarr", aid(1)),
				getUpstreamTargets("sonarr", aid(2)),
				getUpstreamTargets("sonarr", aid(3)),
				getUpstreamTargets("radarr", aid(4)),
			]),
		).resolves.toEqual([
			[{ provider: "sonarr", providerId: tvdb(700), season: 1 }],
			[{ provider: "sonarr", providerId: tvdb(81_797) }],
			[
				{ provider: "sonarr", providerId: tvdb(100), season: 1 },
				{ provider: "sonarr", providerId: tvdb(200), season: 2 },
			],
			[
				{ provider: "radarr", providerId: tmdb(300) },
				{ provider: "radarr", providerId: tmdb(400) },
			],
		]);
	});

	it("derives a normalized Seerr TV target from canonical entries", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					20: [
						{ kind: "tmdb-show", id: tmdb(500) },
						{ kind: "tmdb-show", id: tmdb(500), season: 2 },
						{ kind: "tmdb-show", id: tmdb(500), season: 0 },
						{ kind: "tmdb-show", id: tmdb(500), season: 2 },
						{ kind: "tvdb-show", id: tvdb(700), season: 1 },
						{ kind: "tvdb-show", id: tvdb(700), season: 0 },
					],
				},
				aniListCrosswalks: {},
				fetchedAt: Date.now(),
			},
		});

		await expect(listSeerrUpstreamTargets([aid(20)])).resolves.toEqual([
			{
				anilistId: aid(20),
				target: {
					mediaType: "tv" as const,
					tmdbId: tmdb(500),
					seasons: [0, 1, 2],
					tmdbSeasons: [0, 2],
					tvdbSeasons: [0, 1],
					tvdbId: tvdb(700),
				},
			},
		]);
		await expect(listAllSeerrUpstreamTargets()).resolves.toHaveLength(1);
	});

	it("accepts one unique movie ID and rejects movie ambiguity", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					1: [
						{ kind: "tmdb-movie", id: tmdb(300) },
						{ kind: "tmdb-movie", id: tmdb(300) },
					],
					2: [
						{ kind: "tmdb-movie", id: tmdb(400) },
						{ kind: "tmdb-movie", id: tmdb(300) },
					],
					3: [
						{ kind: "tmdb-movie", id: tmdb(300) },
						{ kind: "tmdb-show", id: tmdb(500), season: 1 },
					],
				},
				aniListCrosswalks: {},
				fetchedAt: Date.now(),
			},
		});

		await expect(
			listSeerrUpstreamTargets([aid(1), aid(2), aid(3)]),
		).resolves.toEqual([
			{
				anilistId: aid(1),
				target: { mediaType: "movie", tmdbId: tmdb(300) },
			},
		]);
	});

	it("uses scoped TVDB seasons with one unscoped TMDB show ID", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					1: [
						{ kind: "tmdb-show", id: tmdb(500) },
						{ kind: "tvdb-show", id: tvdb(700), season: 0 },
					],
				},
				aniListCrosswalks: {},
				fetchedAt: Date.now(),
			},
		});

		await expect(listSeerrUpstreamTargets([aid(1)])).resolves.toEqual([
			{
				anilistId: aid(1),
				target: {
					mediaType: "tv",
					tmdbId: tmdb(500),
					seasons: [0],
					tvdbSeasons: [0],
					tvdbId: tvdb(700),
				},
			},
		]);
	});

	it("derives MAL Arr reads and list aliases through the AniList crosswalk", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		const targets = [
			{ provider: "sonarr" as const, providerId: tvdb(78_874), season: 1 },
		];
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					21: [
						{ kind: "tvdb-show", id: tvdb(78_874), season: 1 },
						{ kind: "tmdb-show", id: tmdb(1396), season: 1 },
					],
				},
				aniListCrosswalks: {
					[sourceIdentityKey(source)]: aid(21),
				},
				fetchedAt: Date.now(),
			},
		});

		await expect(getUpstreamTargets("sonarr", source)).resolves.toEqual(
			targets,
		);
		await expect(getUpstreamTargets("radarr", source)).resolves.toEqual([]);
		await expect(listSourceUpstreamMappings()).resolves.toEqual([
			{
				source: { source: "anilist", id: aid(21) },
				anilistId: aid(21),
				targets,
			},
			{ source, anilistId: aid(21), targets },
		]);
		await expect(
			getUniqueAniListIdForSource({ source: "mal", id: mal(5114) }),
		).resolves.toBe(aid(21));
	});
});
