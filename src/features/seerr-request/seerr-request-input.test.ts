/** Tests effective Seerr target conversion into request inputs. */

import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import type { SeerrRequestTarget } from "@/rpc/types";
import { toSeerrRequestInput } from "./seerr-request-input";

const aid = parseAniListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

describe("toSeerrRequestInput", () => {
	it("converts a Radarr-derived movie target", () => {
		const target: SeerrRequestTarget = {
			anilistId: aid(100),
			mediaType: "movie",
			tmdbId: tmdb(200),
			source: "radarr-mapping",
		};

		expect(toSeerrRequestInput(target)).toEqual({
			anilistId: aid(100),
			mediaType: "movie",
			tmdbId: tmdb(200),
		});
	});

	it("preserves an AniBridge TV target IDs and mapped seasons", () => {
		const target: SeerrRequestTarget = {
			anilistId: aid(100),
			mediaType: "tv",
			tmdbId: tmdb(200),
			tvdbId: tvdb(300),
			seasons: [1, 2],
			source: "anibridge",
		};

		expect(toSeerrRequestInput(target)).toEqual({
			anilistId: aid(100),
			mediaType: "tv",
			tmdbId: tmdb(200),
			tvdbId: tvdb(300),
			seasons: [1, 2],
		});
	});

	it("uses an explicit TV season selection", () => {
		const target: SeerrRequestTarget = {
			anilistId: aid(100),
			mediaType: "tv",
			tmdbId: tmdb(200),
			seasons: [1, 2],
			source: "manual",
		};

		expect(toSeerrRequestInput(target, [2])).toEqual({
			anilistId: aid(100),
			mediaType: "tv",
			tmdbId: tmdb(200),
			seasons: [2],
		});
	});

	it("returns null without a target or with an empty TV selection", () => {
		const target: SeerrRequestTarget = {
			anilistId: aid(100),
			mediaType: "tv",
			tmdbId: tmdb(200),
			seasons: [1],
			source: "manual",
		};

		expect(toSeerrRequestInput(null)).toBeNull();
		expect(toSeerrRequestInput(target, [])).toBeNull();
	});
});
