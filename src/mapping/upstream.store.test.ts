/** Tests for AniBridge upstream mapping parsing. */
// src/mapping/upstream.store.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import {
	clearUpstreamMappings,
	getUniqueAniListIdForSource,
	getUpstreamTargets,
	listSeerrUpstreamTargets,
	parseAniBridgeAniListCrosswalks,
	parseAniBridgeMappings,
	parseAniBridgeSeerrTargets,
	refreshUpstreamMappings,
} from "./upstream.store";
import { sourceIdentityKey } from "./source-identity";

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;
const UPSTREAM_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_ANIBRIDGE_BYTES = 10 * 1024 * 1024;
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

describe("parseAniBridgeMappings", () => {
	it("preserves multiple targets and Sonarr season scope", () => {
		const mappings = parseAniBridgeMappings({
			"anidb:1:R": {
				"anilist:1": {},
				"tvdb_show:100:s1": {},
				"tvdb_show:200:s2": {},
				"tmdb_movie:300": {},
			},
		});

		expect(mappings[sourceIdentityKey({ source: "anilist", id: aid(1) })]).toEqual([
			{ provider: "sonarr", providerId: tvdb(100), season: 1 },
			{ provider: "sonarr", providerId: tvdb(200), season: 2 },
			{ provider: "radarr", providerId: tmdb(300) },
		]);
	});

	it("preserves MAL source descriptor targets", () => {
		const mappings = parseAniBridgeMappings({
			"anidb:5114:R": {
				"anilist:21": {},
				"mal:5114": {},
				"tvdb_show:78874:s1": {},
				"tmdb_show:30991:s1": {},
			},
		});

		expect(mappings[sourceIdentityKey({ source: "mal", id: mal(5114) })]).toEqual([
			{ provider: "sonarr", providerId: tvdb(78_874), season: 1 },
		]);
	});

	it("ignores scoped MAL source descriptors", () => {
		const mappings = parseAniBridgeMappings({
			"anidb:5114:R": {
				"mal:5114:s1": {},
				"tvdb_show:78874:s1": {},
			},
		});

		expect(mappings).toEqual({});
	});

	it("builds unique MAL to AniList crosswalks from same-row targets", () => {
		const crosswalks = parseAniBridgeAniListCrosswalks({
			"anidb:5114:R": {
				"anilist:21": {},
				"mal:5114": {},
				"tvdb_show:78874:s1": {},
			},
		});

		expect(
			crosswalks[sourceIdentityKey({ source: "mal", id: mal(5114) })],
		).toBe(aid(21));
	});

	it("does not build ambiguous MAL to AniList crosswalks", () => {
		const crosswalks = parseAniBridgeAniListCrosswalks({
			"anidb:5114:R": {
				"anilist:21": {},
				"anilist:22": {},
				"mal:5114": {},
			},
		});

		expect(crosswalks).toEqual({});
	});

	it("builds Seerr movie and TV request targets from TMDB upstream IDs", () => {
		const seerrTargets = parseAniBridgeSeerrTargets({
			"anidb:1:R": {
				"anilist:1": {},
				"tmdb_movie:300": {},
				"tvdb_show:100:s1": {},
			},
			"anidb:2:R": {
				"anilist:2": {},
				"tmdb_show:500:s2": {},
				"tmdb_show:500:s1": {},
				"tvdb_show:700:s1": {},
				"tvdb_show:700:s2": {},
			},
		});

		expect(
			seerrTargets[sourceIdentityKey({ source: "anilist", id: aid(1) })],
		).toEqual({
			mediaType: "movie",
			tmdbId: tmdb(300),
		});
		expect(
			seerrTargets[sourceIdentityKey({ source: "anilist", id: aid(2) })],
		).toEqual({
			mediaType: "tv",
			tmdbId: tmdb(500),
			seasons: [1, 2],
			tvdbId: tvdb(700),
		});
	});

	it("does not attach TVDB IDs when scoped TVDB targets disagree", () => {
		const seerrTargets = parseAniBridgeSeerrTargets({
			"anidb:1:R": {
				"anilist:1": {},
				"tmdb_show:500:s1": {},
				"tmdb_show:500:s2": {},
				"tvdb_show:700:s1": {},
				"tvdb_show:701:s2": {},
			},
		});

		expect(
			seerrTargets[sourceIdentityKey({ source: "anilist", id: aid(1) })],
		).toEqual({
			mediaType: "tv",
			tmdbId: tmdb(500),
			seasons: [1, 2],
		});
	});
});

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
