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
	getSourceAliasesByAniListId,
	getSourceSeerrUpstreamMapping,
	getSourceUpstreamMapping,
	getUniqueAniListIdForSource,
	getUniqueAniListIdsForSources,
	listAllSeerrUpstreamTargets,
	listAniListUpstreamMappings,
	listSeerrUpstreamTargets,
	refreshUpstreamMappings,
} from "./upstream.store";

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;
const anilistSource = (id: number) =>
	({ source: "anilist", id: aid(id) }) as const;
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

	it("persists source-keyed entries and refresh metadata", async () => {
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

		await expect(refreshUpstreamMappings()).resolves.toBe(true);

		const stored = await browser.storage.local.get(UPSTREAM_STORAGE_KEY);
		expect(stored[UPSTREAM_STORAGE_KEY]).toEqual({
			entries: {
				"anilist:1": [
					{ kind: "tmdb-movie", id: tmdb(300) },
					{ kind: "tmdb-show", id: tmdb(500), season: 2 },
					{ kind: "tvdb-show", id: tvdb(700), season: 0 },
				],
			},
			aniListCrosswalks: {},
			fetchedAt: expect.any(Number),
		});
	});

	it("reports unchanged without downloading a fresh canonical snapshot", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					"anilist:1": [{ kind: "tmdb-movie", id: tmdb(300) }],
				},
				aniListCrosswalks: {},
				fetchedAt: Date.now(),
			},
		});
		const fetchMock = vi.fn<typeof fetch>();
		vi.stubGlobal("fetch", fetchMock);

		await expect(refreshUpstreamMappings()).resolves.toBe(false);

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("forces a full refresh for fresh legacy snapshots", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					1: [{ kind: "tmdb-movie", id: tmdb(300) }],
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

		await expect(refreshUpstreamMappings()).resolves.toBe(true);

		expect(fetchMock).toHaveBeenCalledOnce();
		const stored = await browser.storage.local.get(UPSTREAM_STORAGE_KEY);
		expect(stored[UPSTREAM_STORAGE_KEY]).toEqual({
			entries: {
				"anilist:1": [{ kind: "tmdb-movie", id: tmdb(400) }],
			},
			aniListCrosswalks: {},
			fetchedAt: expect.any(Number),
		});
		await expect(
			getSourceUpstreamMapping("radarr", anilistSource(1)),
		).resolves.toEqual({
			anilistId: aid(1),
			targets: [{ provider: "radarr", providerId: tmdb(400) }],
		});
	});

	it("refreshes canonical snapshot metadata after an ETag 304", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
		const entries = {
			"anilist:1": [{ kind: "tmdb-movie", id: tmdb(300) }],
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

		await expect(refreshUpstreamMappings()).resolves.toBe(false);

		const stored = await browser.storage.local.get(UPSTREAM_STORAGE_KEY);
		expect(stored[UPSTREAM_STORAGE_KEY]).toEqual({
			entries,
			aniListCrosswalks: {},
			fetchedAt: Date.now(),
			etag: "canonical-etag",
		});
	});

	it("reports unchanged when a download contains the same mapping facts", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
		const entries = {
			"anilist:1": [{ kind: "tmdb-movie" as const, id: tmdb(300) }],
		};
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries,
				aniListCrosswalks: { "mal:5114": aid(1) },
				fetchedAt: Date.now() - UPSTREAM_REFRESH_INTERVAL_MS - 1,
				etag: "old-etag",
			},
		});
		mockAniBridgeResponse(
			createAniBridgeResponse(
				JSON.stringify({
					"anilist:1": { "tmdb_movie:300": {} },
					"mal:5114": { "anilist:1": {} },
				}),
				{ ETag: "new-etag" },
			),
		);

		await expect(refreshUpstreamMappings()).resolves.toBe(false);

		const stored = await browser.storage.local.get(UPSTREAM_STORAGE_KEY);
		expect(stored[UPSTREAM_STORAGE_KEY]).toEqual({
			entries,
			aniListCrosswalks: { "mal:5114": aid(1) },
			fetchedAt: Date.now(),
			etag: "new-etag",
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

		await expect(
			getSourceUpstreamMapping("radarr", anilistSource(1)),
		).resolves.toEqual({
			anilistId: aid(1),
			targets: [{ provider: "radarr", providerId: tmdb(300) }],
		});
		await expect(listSeerrUpstreamTargets([aid(1)])).resolves.toEqual([
			{
				anilistId: aid(1),
				kind: "target",
				target: { mediaType: "movie", tmdbId: tmdb(300) },
			},
		]);
	});

	it("normalizes Arr targets by provider ID", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					"anilist:1": [{ kind: "tvdb-show", id: tvdb(700), season: 1 }],
					"anilist:2": [
						{ kind: "tvdb-show", id: tvdb(81_797), season: 0 },
						{ kind: "tvdb-show", id: tvdb(81_797), season: 1 },
						{ kind: "tvdb-show", id: tvdb(81_797), season: 2 },
					],
					"anilist:3": [
						{ kind: "tvdb-show", id: tvdb(100), season: 1 },
						{ kind: "tvdb-show", id: tvdb(200), season: 2 },
					],
					"anilist:4": [
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
				getSourceUpstreamMapping("sonarr", anilistSource(1)),
				getSourceUpstreamMapping("sonarr", anilistSource(2)),
				getSourceUpstreamMapping("sonarr", anilistSource(3)),
				getSourceUpstreamMapping("radarr", anilistSource(4)),
			]),
		).resolves.toEqual([
			{
				anilistId: aid(1),
				targets: [{ provider: "sonarr", providerId: tvdb(700), season: 1 }],
			},
			{
				anilistId: aid(2),
				targets: [{ provider: "sonarr", providerId: tvdb(81_797) }],
			},
			{
				anilistId: aid(3),
				targets: [
					{ provider: "sonarr", providerId: tvdb(100), season: 1 },
					{ provider: "sonarr", providerId: tvdb(200), season: 2 },
				],
			},
			{
				anilistId: aid(4),
				targets: [
					{ provider: "radarr", providerId: tmdb(300) },
					{ provider: "radarr", providerId: tmdb(400) },
				],
			},
		]);
	});

	it("derives a normalized Seerr TV target from canonical entries", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					"anilist:20": [
						{ kind: "tmdb-show", id: tmdb(500) },
						{ kind: "tmdb-show", id: tmdb(500), season: 2 },
						{ kind: "tmdb-show", id: tmdb(500), season: 0 },
						{ kind: "tmdb-show", id: tmdb(500), season: 2 },
						{ kind: "tvdb-show", id: tvdb(700), season: 1 },
						{ kind: "tvdb-show", id: tvdb(700), season: 0 },
					],
					"anilist:21": [{ kind: "tmdb-show", id: tmdb(501) }],
				},
				aniListCrosswalks: {},
				fetchedAt: Date.now(),
			},
		});

		await expect(listSeerrUpstreamTargets([aid(20), aid(21)])).resolves.toEqual([
			{
				anilistId: aid(20),
				kind: "target",
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
				anilistId: aid(21),
				kind: "target",
				target: {
					mediaType: "tv",
					tmdbId: tmdb(501),
				},
			},
		]);
		await expect(listAllSeerrUpstreamTargets()).resolves.toHaveLength(2);
	});

	it("accepts one unique movie ID and reports movie conflicts", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					"anilist:1": [
						{ kind: "tmdb-movie", id: tmdb(300) },
						{ kind: "tmdb-movie", id: tmdb(300) },
					],
					"anilist:2": [
						{ kind: "tmdb-movie", id: tmdb(400) },
						{ kind: "tmdb-movie", id: tmdb(300) },
					],
					"anilist:3": [
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
				kind: "target",
				target: { mediaType: "movie", tmdbId: tmdb(300) },
			},
			{ anilistId: aid(2), kind: "conflict" },
			{ anilistId: aid(3), kind: "conflict" },
		]);
	});

	it("uses scoped TVDB seasons with one unscoped TMDB show ID", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					"anilist:1": [
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
				kind: "target",
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

	it("uses direct MAL targets before provider-specific AniList fallbacks", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		const lowerAlias = { source: "mal", id: mal(100) } as const;
		const targets = [
			{ provider: "sonarr" as const, providerId: tvdb(78_874), season: 1 },
		];
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					"anilist:21": [
						{ kind: "tvdb-show", id: tvdb(78_874), season: 1 },
						{ kind: "tmdb-show", id: tmdb(1396), season: 1 },
					],
					"mal:5114": [{ kind: "tmdb-movie", id: tmdb(300) }],
				},
				aniListCrosswalks: {
					[sourceIdentityKey(source)]: aid(21),
					[sourceIdentityKey(lowerAlias)]: aid(21),
				},
				fetchedAt: Date.now(),
			},
		});

		await expect(getSourceUpstreamMapping("sonarr", source)).resolves.toEqual({
			anilistId: aid(21),
			targets,
		});
		await expect(getSourceUpstreamMapping("radarr", source)).resolves.toEqual({
			anilistId: aid(21),
			targets: [{ provider: "radarr", providerId: tmdb(300) }],
		});
		await expect(listAniListUpstreamMappings()).resolves.toEqual([
			{
				anilistId: aid(21),
				targets,
			},
		]);
		await expect(
			getUniqueAniListIdForSource({ source: "mal", id: mal(5114) }),
		).resolves.toBe(aid(21));
		await expect(getSourceAliasesByAniListId()).resolves.toEqual(
			new Map([[aid(21), [lowerAlias, source]]]),
		);
	});

	it("falls back to AniList Seerr facts only when direct MAL facts are missing", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					"anilist:21": [{ kind: "tmdb-movie", id: tmdb(400) }],
				},
				aniListCrosswalks: { [sourceIdentityKey(source)]: aid(21) },
				fetchedAt: Date.now(),
			},
		});

		await expect(getSourceSeerrUpstreamMapping(source)).resolves.toEqual({
			anilistId: aid(21),
			kind: "target",
			target: { mediaType: "movie", tmdbId: tmdb(400) },
		});
	});

	it("does not replace conflicting direct MAL facts with an AniList target", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					"anilist:21": [{ kind: "tmdb-movie", id: tmdb(400) }],
					"mal:5114": [
						{ kind: "tmdb-movie", id: tmdb(100) },
						{ kind: "tmdb-movie", id: tmdb(200) },
					],
				},
				aniListCrosswalks: { [sourceIdentityKey(source)]: aid(21) },
				fetchedAt: Date.now(),
			},
		});

		await expect(getSourceSeerrUpstreamMapping(source)).resolves.toEqual({
			anilistId: aid(21),
			kind: "conflict",
		});
	});

	it("returns a direct MAL target without an AniList alias", async () => {
		const source = { source: "mal", id: mal(59_571) } as const;
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					"mal:59571": [{ kind: "tmdb-movie", id: tmdb(1_333_100) }],
				},
				aniListCrosswalks: {},
				fetchedAt: Date.now(),
			},
		});

		await expect(getSourceUpstreamMapping("radarr", source)).resolves.toEqual({
			anilistId: null,
			targets: [{ provider: "radarr", providerId: tmdb(1_333_100) }],
		});
		await expect(getSourceSeerrUpstreamMapping(source)).resolves.toEqual({
			anilistId: null,
			kind: "target",
			target: { mediaType: "movie", tmdbId: tmdb(1_333_100) },
		});
		await expect(listAniListUpstreamMappings()).resolves.toEqual([]);
	});

	it("resolves a deduplicated alias batch with one pure storage read", async () => {
		const mapped = { source: "mal", id: mal(5114) } as const;
		const missing = { source: "mal", id: mal(59_571) } as const;
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {},
				aniListCrosswalks: { "mal:5114": aid(21) },
				fetchedAt: Date.now(),
			},
		});
		const getSpy = vi.spyOn(browser.storage.local, "get");
		const setSpy = vi.spyOn(browser.storage.local, "set");

		await expect(
			getUniqueAniListIdsForSources([
				mapped,
				missing,
				mapped,
				anilistSource(10),
			]),
		).resolves.toEqual({
			"mal:5114": aid(21),
			"mal:59571": null,
			"anilist:10": aid(10),
		});
		expect(getSpy).toHaveBeenCalledOnce();
		expect(setSpy).not.toHaveBeenCalled();
		getSpy.mockRestore();
		setSpy.mockRestore();
	});
});
