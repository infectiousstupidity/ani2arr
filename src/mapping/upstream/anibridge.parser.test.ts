/** Tests for pure AniBridge v3 row parsing. */

import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import { sourceIdentityKey } from "../source-identity";
import { parseAniBridgeData } from "./anibridge.parser";

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

describe("parseAniBridgeData", () => {
	it("emits normalized independent records with scopes and MAL links", () => {
		const { records } = parseAniBridgeData({
			"anilist:113415": {
				"tmdb_movie:300": {},
				"tmdb_show:95479:s1": {},
				"tvdb_show:377543:s1": {},
				"tmdb_show:500:sx": {},
			},
			"mal:40748": { "anilist:113415": {}, "tvdb_show:78874:s1": {} },
		});
		expect(records["anilist:113415"]).toEqual({
			facts: {
				tmdbMovie: tmdb(300),
				tmdbShow: tmdb(95_479),
				tvdbShow: tvdb(377_543),
			},
			scopes: {
				tmdbShow: { id: tmdb(95_479), seasons: [1] },
				tvdbShow: { id: tvdb(377_543), seasons: [1] },
			},
		});
		expect(records["mal:40748"]).toEqual({
			linkedAniListId: aid(113_415),
			facts: { tvdbShow: tvdb(78_874) },
			scopes: { tvdbShow: { id: tvdb(78_874), seasons: [1] } },
		});
	});

	it("retains scoped seasons when the same series is also unscoped", () => {
		const { records } = parseAniBridgeData({
			"anilist:1": {
				"tmdb_show:500": {},
				"tmdb_show:500:s2": {},
				"tvdb_show:600": {},
				"tvdb_show:600:s3": {},
			},
		});

		expect(records["anilist:1"]).toEqual({
			facts: { tmdbShow: tmdb(500), tvdbShow: tvdb(600) },
			scopes: {
				tmdbShow: { id: tmdb(500), seasons: [2] },
				tvdbShow: { id: tvdb(600), seasons: [3] },
			},
		});
	});

	it("omits ambiguous links and represents candidate ambiguity as conflicts", () => {
		const { records } = parseAniBridgeData({
			"mal:5114": {
				"anilist:21": {},
				"anilist:22": {},
				"tmdb_show:37854:s1": {},
				"tmdb_show:40000:s2": {},
			},
			"mal:1": { "anilist:21": {} },
		});
		expect(
			records[sourceIdentityKey({ source: "mal", id: mal(5114) })],
		).toEqual({
			facts: {},
			conflicts: {
				tmdbShow: [
					{ id: tmdb(37_854), seasons: [1] },
					{ id: tmdb(40_000), seasons: [2] },
				],
			},
		});
		expect(records[sourceIdentityKey({ source: "mal", id: mal(1) })]).toEqual({
			facts: {},
			linkedAniListId: aid(21),
		});
	});
});
