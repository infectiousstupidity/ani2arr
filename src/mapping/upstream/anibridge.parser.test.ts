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
	it("keeps provider targets under their source identity", () => {
		const { entries } = parseAniBridgeData({
			"anilist:113415": {
				"tmdb_movie:300": {},
				"tmdb_show:95479:s1": {},
				"tvdb_show:377543:s1": {},
				"tmdb_show:500:sx": {},
				"tvdb_show:0:s1": {},
				"unsupported:800": {},
			},
			"tmdb_show:95479:s1": {
				"anilist:113415": {},
				"anilist:145064": {},
				"anilist:172463": {},
				"tvdb_show:377543:s1": {},
				"tvdb_show:377543:s2": {},
				"tvdb_show:377543:s3": {},
			},
			"mal:59571": {
				"tmdb_movie:1333100": {},
			},
			"mal:40748": {
				"anilist:113415": {},
				"tvdb_show:78874:s1": {},
			},
		});

		expect(entries["anilist:113415"]).toEqual([
			{ kind: "tmdb-movie", id: tmdb(300) },
			{ kind: "tmdb-show", id: tmdb(95_479), season: 1 },
			{ kind: "tvdb-show", id: tvdb(377_543), season: 1 },
		]);
		expect(entries["mal:59571"]).toEqual([
			{ kind: "tmdb-movie", id: tmdb(1_333_100) },
		]);
		expect(entries["mal:40748"]).toEqual([
			{ kind: "tvdb-show", id: tvdb(78_874), season: 1 },
		]);
		expect(entries["anilist:145064"]).toBeUndefined();
		expect(entries["anilist:172463"]).toBeUndefined();
	});
});

describe("parseAniBridgeData AniList crosswalks", () => {
	it("uses only canonical MAL rows with one AniList target", () => {
		const { aniListCrosswalks } = parseAniBridgeData({
			"mal:40748": {
				"anilist:113415": {},
				"tvdb_show:78874:s1": {},
			},
			"mal:5114": {
				"anilist:21": {},
				"anilist:22": {},
			},
			"anidb:1:R": {
				"anilist:1": {},
				"mal:1": {},
			},
		});

		expect(aniListCrosswalks).toEqual({
			[sourceIdentityKey({ source: "mal", id: mal(40_748) })]: aid(113_415),
		});
	});
});
