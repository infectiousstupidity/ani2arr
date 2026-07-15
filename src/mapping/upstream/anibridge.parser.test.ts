/** Tests for pure AniBridge v3 row parsing. */
// src/mapping/upstream/anibridge.parser.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import { sourceIdentityKey } from "@/mapping/source-identity";
import {
	parseAniBridgeAniListCrosswalks,
	parseAniBridgeEntries,
	parseAniBridgeMappings,
	parseAniBridgeSeerrTargets,
} from "@/mapping/upstream/anibridge.parser";

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

describe("parseAniBridgeEntries", () => {
	it("parses supported target kinds and preserves optional season scope", () => {
		const entries = parseAniBridgeEntries({
			"anidb:1:R": {
				"anilist:1": {},
				"tmdb_movie:300": {},
				"tmdb_show:500:s2": {},
				"tvdb_show:700:s0": {},
				"tvdb_show:701": {},
			},
		});

		expect(entries[aid(1)]).toEqual([
			{ kind: "tmdb-movie", id: tmdb(300) },
			{ kind: "tmdb-show", id: tmdb(500), season: 2 },
			{ kind: "tvdb-show", id: tvdb(700), season: 0 },
			{ kind: "tvdb-show", id: tvdb(701) },
		]);
	});

	it("deduplicates exact targets but preserves distinct season scope", () => {
		const entries = parseAniBridgeEntries({
			"anidb:1:R": {
				"anilist:1": {},
				"tvdb_show:700:s0": {},
			},
			"anidb:1:S": {
				"anilist:1": {},
				"tvdb_show:700:s0": {},
				"tvdb_show:700:s1": {},
				"tvdb_show:700": {},
			},
		});

		expect(entries[aid(1)]).toEqual([
			{ kind: "tvdb-show", id: tvdb(700), season: 0 },
			{ kind: "tvdb-show", id: tvdb(700), season: 1 },
			{ kind: "tvdb-show", id: tvdb(700) },
		]);
	});

	it("ignores malformed and unsupported target descriptors", () => {
		const entries = parseAniBridgeEntries({
			"anidb:1:R": {
				"anilist:1": {},
				"tmdb_movie:300:s1": {},
				"tmdb_show:500:sx": {},
				"tvdb_show:0:s1": {},
				"tvdb_show:700:s-1": {},
				"unsupported:800": {},
			},
		});

		expect(entries).toEqual({});
	});
});

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
				"tvdb_show:700:s1": {},
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
			tmdbSeasons: [2],
			tvdbSeasons: [1],
			tvdbId: tvdb(700),
		});
	});

	it("stores Seerr request targets only under AniList source keys", () => {
		const seerrTargets = parseAniBridgeSeerrTargets({
			"anidb:5114:R": {
				"anilist:21": {},
				"mal:5114": {},
				"tmdb_movie:300": {},
			},
		});

		expect(
			seerrTargets[sourceIdentityKey({ source: "anilist", id: aid(21) })],
		).toEqual({
			mediaType: "movie",
			tmdbId: tmdb(300),
		});
		expect(
			seerrTargets[sourceIdentityKey({ source: "mal", id: mal(5114) })],
		).toBeUndefined();
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
			tmdbSeasons: [1, 2],
		});
	});
});
