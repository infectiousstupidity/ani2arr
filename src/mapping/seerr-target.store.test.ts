/** Tests for persistent manual Seerr request targets. */
// src/mapping/seerr-target.store.test.ts

import { beforeEach, describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import {
	clearManualSeerrTarget,
	clearManualSeerrTargets,
	getManualSeerrTarget,
	listManualSeerrTargets,
	setManualSeerrTarget,
} from "./seerr-target.store";

const aid = parseAniListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

describe("manual Seerr target store", () => {
	beforeEach(async () => {
		await clearManualSeerrTargets();
	});

	it("stores movie and TV targets", async () => {
		await setManualSeerrTarget({
			anilistId: aid(1),
			mediaType: "movie",
			tmdbId: tmdb(10),
		});
		await setManualSeerrTarget({
			anilistId: aid(2),
			mediaType: "tv",
			tmdbId: tmdb(20),
			tvdbId: tvdb(30),
			seasons: [2, 1, 2],
		});

		await expect(getManualSeerrTarget(aid(1))).resolves.toEqual({
			anilistId: aid(1),
			mediaType: "movie",
			tmdbId: tmdb(10),
		});
		await expect(getManualSeerrTarget(aid(2))).resolves.toEqual({
			anilistId: aid(2),
			mediaType: "tv",
			tmdbId: tmdb(20),
			tvdbId: tvdb(30),
			seasons: [1, 2],
		});
	});

	it("lists requested targets and clears one target", async () => {
		await setManualSeerrTarget({
			anilistId: aid(2),
			mediaType: "movie",
			tmdbId: tmdb(20),
		});
		await setManualSeerrTarget({
			anilistId: aid(1),
			mediaType: "movie",
			tmdbId: tmdb(10),
		});

		await expect(listManualSeerrTargets([aid(1)])).resolves.toEqual([
			{
				anilistId: aid(1),
				mediaType: "movie",
				tmdbId: tmdb(10),
			},
		]);

		await clearManualSeerrTarget(aid(1));

		await expect(getManualSeerrTarget(aid(1))).resolves.toBeNull();
		await expect(getManualSeerrTarget(aid(2))).resolves.toEqual({
			anilistId: aid(2),
			mediaType: "movie",
			tmdbId: tmdb(20),
		});
	});

	it("rejects TV targets with no seasons", async () => {
		await expect(
			setManualSeerrTarget({
				anilistId: aid(1),
				mediaType: "tv",
				tmdbId: tmdb(10),
				seasons: [],
			}),
		).rejects.toThrow("Invalid Seerr target.");
	});
});
