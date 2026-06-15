/** Tests for AniBridge upstream mapping parsing. */
// src/mapping/upstream.store.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/types";
import {
	parseTmdbId,
	parseTvdbId,
} from "@/providers/schemas";
import {
	parseAniBridgeMappings,
	parseAniBridgeSeerrTargets,
} from "./upstream.store";

const aid = parseAniListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

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
