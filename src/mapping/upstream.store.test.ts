/** Tests for AniBridge upstream mapping parsing. */
// src/mapping/upstream.store.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import {
	clearUpstreamMappings,
	getUpstreamTargets,
	listSeerrUpstreamTargets,
	parseAniBridgeMappings,
	parseAniBridgeSeerrTargets,
	refreshUpstreamMappings,
} from "./upstream.store";

const aid = parseAniListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;
const UPSTREAM_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_ANIBRIDGE_BYTES = 10 * 1024 * 1024;

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
			"anilist:1": {
				"tvdb_show:100:s1": {},
				"tvdb_show:200:s2": {},
				"tmdb_movie:300": {},
			},
		});

		expect(mappings[aid(1)]).toEqual([
			{ provider: "sonarr", providerId: tvdb(100), season: 1 },
			{ provider: "sonarr", providerId: tvdb(200), season: 2 },
			{ provider: "radarr", providerId: tmdb(300) },
		]);
	});

	it("builds Seerr movie and TV request targets from TMDB upstream IDs", () => {
		const seerrTargets = parseAniBridgeSeerrTargets({
			"anilist:1": {
				"tmdb_movie:300": {},
				"tvdb_show:100:s1": {},
			},
			"anilist:2": {
				"tmdb_show:500:s2": {},
				"tmdb_show:500:s1": {},
				"tvdb_show:700:s1": {},
				"tvdb_show:700:s2": {},
			},
		});

		expect(seerrTargets[aid(1)]).toEqual({
			mediaType: "movie",
			tmdbId: tmdb(300),
		});
		expect(seerrTargets[aid(2)]).toEqual({
			mediaType: "tv",
			tmdbId: tmdb(500),
			seasons: [1, 2],
			tvdbId: tvdb(700),
		});
	});

	it("does not attach TVDB IDs when scoped TVDB targets disagree", () => {
		const seerrTargets = parseAniBridgeSeerrTargets({
			"anilist:1": {
				"tmdb_show:500:s1": {},
				"tmdb_show:500:s2": {},
				"tvdb_show:700:s1": {},
				"tvdb_show:701:s2": {},
			},
		});

		expect(seerrTargets[aid(1)]).toEqual({
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
				JSON.stringify({ "anilist:1": { "tmdb_movie:300": {} } }),
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
});
