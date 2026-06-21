/** Tests for pure AniBridge v3 row parsing. */
// src/mapping/upstream/anibridge.parser.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import { sourceIdentityKey } from "@/mapping/source-identity";
import {
	parseAniBridgeAniListCrosswalks,
	parseAniBridgeMappings,
	parseAniBridgeSeerrTargets,
} from "@/mapping/upstream/anibridge.parser";

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

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
