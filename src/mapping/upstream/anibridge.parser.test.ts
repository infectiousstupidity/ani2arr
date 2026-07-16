/** Tests for pure AniBridge v3 row parsing. */
// src/mapping/upstream/anibridge.parser.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import { sourceIdentityKey } from "@/mapping/source-identity";
import { parseAniBridgeData } from "@/mapping/upstream/anibridge.parser";

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

describe("parseAniBridgeData entries", () => {
	it("parses supported target kinds and preserves optional season scope", () => {
		const { entries } = parseAniBridgeData({
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
		const { entries } = parseAniBridgeData({
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
		const { entries } = parseAniBridgeData({
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

describe("parseAniBridgeData AniList crosswalks", () => {
	it("builds unique MAL to AniList crosswalks from same-row targets", () => {
		const { aniListCrosswalks } = parseAniBridgeData({
			"anidb:5114:R": {
				"anilist:21": {},
				"mal:5114": {},
				"tvdb_show:78874:s1": {},
			},
		});

		expect(
			aniListCrosswalks[
				sourceIdentityKey({ source: "mal", id: mal(5114) })
			],
		).toBe(aid(21));
	});

	it("does not build ambiguous MAL to AniList crosswalks", () => {
		const { aniListCrosswalks } = parseAniBridgeData({
			"anidb:5114:R": {
				"anilist:21": {},
				"anilist:22": {},
				"mal:5114": {},
			},
		});

		expect(aniListCrosswalks).toEqual({});
	});

	it("ignores scoped MAL source descriptors", () => {
		const { aniListCrosswalks } = parseAniBridgeData({
			"anidb:5114:R": {
				"anilist:21": {},
				"mal:5114:s1": {},
				"tvdb_show:78874:s1": {},
			},
		});

		expect(aniListCrosswalks).toEqual({});
	});
});
