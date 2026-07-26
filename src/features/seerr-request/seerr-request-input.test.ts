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
	it("converts an automatic movie target", () => {
		const target: SeerrRequestTarget = {
			anilistId: aid(100),
			mediaType: "movie",
			tmdbId: tmdb(200),
			source: "automatic",
		};

		expect(toSeerrRequestInput(target)).toEqual({
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
			mediaType: "tv",
			tmdbId: tmdb(200),
			seasons: [2],
		});
	});

	it("requires request scope for a show-only target", () => {
		const target: SeerrRequestTarget = {
			anilistId: aid(100),
			mediaType: "tv",
			tmdbId: tmdb(200),
			source: "manual",
		};

		expect(toSeerrRequestInput(null)).toBeNull();
		expect(toSeerrRequestInput(target)).toBeNull();
		expect(toSeerrRequestInput(target, [])).toBeNull();
		expect(toSeerrRequestInput(target, "all")).toEqual({
			mediaType: "tv",
			tmdbId: tmdb(200),
			seasons: "all",
		});
	});
});
