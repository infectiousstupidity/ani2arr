/** Tests for AniBridge upstream mapping parsing. */
// src/mapping/upstream.store.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/types";
import {
	parseTmdbId,
	parseTvdbId,
} from "@/providers/schemas";
import { parseAniBridgeMappings } from "./upstream.store";

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
});
