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

	it("strips legacy projections from fresh canonical snapshots without fetching", async () => {
		const fetchedAt = Date.now();
		const entries = {
			1: [{ kind: "tmdb-movie", id: tmdb(300) }],
		};
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries,
				mappings: {
					"anilist:1": [{ provider: "radarr", providerId: tmdb(999) }],
				},
				seerrTargets: {
					"anilist:1": { mediaType: "movie", tmdbId: tmdb(999) },
				},
				aniListCrosswalks: {},
				fetchedAt,
				etag: "canonical-etag",
			},
		});
		const fetchMock = vi.fn<typeof fetch>();
		vi.stubGlobal("fetch", fetchMock);

		await refreshUpstreamMappings();

		expect(fetchMock).not.toHaveBeenCalled();
		const stored = await browser.storage.local.get(UPSTREAM_STORAGE_KEY);
		expect(stored[UPSTREAM_STORAGE_KEY]).toEqual({
			entries,
			aniListCrosswalks: {},
			fetchedAt,
			etag: "canonical-etag",
		});
		await expect(listSeerrUpstreamTargets([aid(1)])).resolves.toEqual([
			{ anilistId: aid(1), target: { mediaType: "movie", tmdbId: tmdb(300) } },
		]);
	});

	it("keeps canonical entries and strips projections after an ETag 304", async () => {
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

	it("ignores legacy consumer projections on read", async () => {
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

		await expect(getUpstreamTargets("radarr", aid(1))).resolves.toEqual([]);
		await expect(listSeerrUpstreamTargets([aid(1)])).resolves.toEqual([]);
	});

	it("derives Arr reads and records only from canonical entries", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					1: [
						{ kind: "tmdb-movie", id: tmdb(300) },
						{ kind: "tmdb-show", id: tmdb(500), season: 2 },
						{ kind: "tvdb-show", id: tvdb(700) },
						{ kind: "tvdb-show", id: tvdb(700), season: 0 },
						{ kind: "tvdb-show", id: tvdb(700), season: 2 },
					],
					2: [{ kind: "tmdb-show", id: tmdb(600), season: 1 }],
					invalid: [{ kind: "tmdb-movie", id: tmdb(999) }],
				},
				mappings: {
					"anilist:1": [
						{ provider: "radarr", providerId: tmdb(999) },
						{ provider: "sonarr", providerId: tvdb(999) },
					],
					"anilist:2": [{ provider: "radarr", providerId: tmdb(600) }],
				},
				fetchedAt: Date.now(),
			},
		});

		const sonarrTargets = [
			{ provider: "sonarr" as const, providerId: tvdb(700) },
			{ provider: "sonarr" as const, providerId: tvdb(700), season: 0 },
			{ provider: "sonarr" as const, providerId: tvdb(700), season: 2 },
		];
		await expect(getUpstreamTargets("radarr", aid(1))).resolves.toEqual([
			{ provider: "radarr", providerId: tmdb(300) },
		]);
		await expect(getUpstreamTargets("sonarr", aid(1))).resolves.toEqual(
			sonarrTargets,
		);
		await expect(getUpstreamTargets("radarr", aid(2))).resolves.toEqual([]);
		await expect(listSourceUpstreamMappings()).resolves.toEqual([
			{
				source: { source: "anilist", id: aid(1) },
				anilistId: aid(1),
				targets: [
					{ provider: "radarr", providerId: tmdb(300) },
					...sonarrTargets,
				],
			},
			{
				source: { source: "anilist", id: aid(2) },
				anilistId: aid(2),
				targets: [],
			},
		]);
	});

	it("derives normalized Seerr movies and TV targets from canonical entries", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					10: [
						{ kind: "tmdb-show", id: tmdb(600), season: 1 },
						{ kind: "tmdb-show", id: tmdb(601) },
					],
					20: [
						{ kind: "tmdb-show", id: tmdb(500) },
						{ kind: "tmdb-show", id: tmdb(500), season: 2 },
						{ kind: "tmdb-show", id: tmdb(500), season: 0 },
						{ kind: "tmdb-show", id: tmdb(500), season: 2 },
						{ kind: "tvdb-show", id: tvdb(700), season: 1 },
						{ kind: "tvdb-show", id: tvdb(700), season: 0 },
						{ kind: "tvdb-show", id: tvdb(700), season: -1 },
					],
					40: [{ kind: "tmdb-show", id: tmdb(700) }],
					50: [
						{ kind: "tmdb-show", id: tmdb(800), season: 2 },
						{ kind: "tvdb-show", id: tvdb(900), season: 1 },
						{ kind: "tvdb-show", id: tvdb(901), season: 3 },
					],
					60: [
						{ kind: "tmdb-show", id: 0, season: 1 },
						{ kind: "tvdb-show", id: tvdb(902), season: 1 },
					],
					invalid: [{ kind: "tmdb-movie", id: tmdb(999) }],
				},
				aniListCrosswalks: {},
				fetchedAt: Date.now(),
			},
		});

		const expected = [
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
			{
				anilistId: aid(50),
				target: {
					mediaType: "tv" as const,
					tmdbId: tmdb(800),
					seasons: [2],
					tmdbSeasons: [2],
				},
			},
		];

		await expect(
			listSeerrUpstreamTargets([
				aid(50),
				aid(20),
				aid(10),
				aid(40),
				aid(60),
				aid(20),
			]),
		).resolves.toEqual(expected);
		await expect(listAllSeerrUpstreamTargets()).resolves.toEqual(expected);
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
				mappings: {
					[sourceIdentityKey(source)]: [
						{ provider: "radarr", providerId: tmdb(999) },
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
	});

	it("does not read legacy AniList or MAL-keyed Seerr targets", async () => {
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

		await expect(listSeerrUpstreamTargets([aid(21)])).resolves.toEqual([]);
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
