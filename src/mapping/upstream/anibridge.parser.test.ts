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

describe("parseAniBridgeData", () => {
	it("keeps targets, season scope, and one MAL link in each source record", () => {
		const { records } = parseAniBridgeData({
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

		expect(records["anilist:113415"]).toEqual({
			targets: [
				{ kind: "tmdb-movie", id: tmdb(300) },
				{ kind: "tmdb-show", id: tmdb(95_479), season: 1 },
				{ kind: "tvdb-show", id: tvdb(377_543), season: 1 },
			],
		});
		expect(records["mal:59571"]).toEqual({
			targets: [{ kind: "tmdb-movie", id: tmdb(1_333_100) }],
		});
		expect(records["mal:40748"]).toEqual({
			linkedAniListId: aid(113_415),
			targets: [{ kind: "tvdb-show", id: tvdb(78_874), season: 1 }],
		});
		expect(records["anilist:145064"]).toBeUndefined();
		expect(records["anilist:172463"]).toBeUndefined();
	});

	it("omits missing and ambiguous links without dropping valid targets", () => {
		const { records } = parseAniBridgeData({
			"mal:40748": {
				"tvdb_show:78874:s1": {},
			},
			"mal:5114": {
				"anilist:21": {},
				"anilist:22": {},
				"tmdb_show:37854:s1": {},
			},
			"mal:1": {
				"anilist:21": {},
			},
		});

		expect(records).toEqual({
			[sourceIdentityKey({ source: "mal", id: mal(40_748) })]: {
				targets: [{ kind: "tvdb-show", id: tvdb(78_874), season: 1 }],
			},
			[sourceIdentityKey({ source: "mal", id: mal(5114) })]: {
				targets: [{ kind: "tmdb-show", id: tmdb(37_854), season: 1 }],
			},
			[sourceIdentityKey({ source: "mal", id: mal(1) })]: {
				linkedAniListId: aid(21),
				targets: [],
			},
		});
	});
});
