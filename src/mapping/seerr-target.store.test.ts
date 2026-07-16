/** Tests for manual Seerr persistence and effective target precedence. */
// src/mapping/seerr-target.store.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import {
	clearManualSeerrTarget,
	clearManualSeerrTargets,
	getEffectiveSeerrTarget,
	listAllEffectiveSeerrTargets,
	listEffectiveSeerrTargets,
	setManualSeerrTarget,
} from "./seerr-target.store";

const listSeerrUpstreamTargetsMock = vi.hoisted(() => vi.fn());
const listAllSeerrUpstreamTargetsMock = vi.hoisted(() => vi.fn());

vi.mock("./upstream.store", () => ({
	listSeerrUpstreamTargets: listSeerrUpstreamTargetsMock,
	listAllSeerrUpstreamTargets: listAllSeerrUpstreamTargetsMock,
}));

const aid = parseAniListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

describe("Seerr targets", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		listSeerrUpstreamTargetsMock.mockResolvedValue([]);
		listAllSeerrUpstreamTargetsMock.mockResolvedValue([]);
		await clearManualSeerrTargets();
	});

	it("stores and normalizes manual movie and TV targets", async () => {
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

		await expect(getEffectiveSeerrTarget(aid(1))).resolves.toEqual({
			anilistId: aid(1),
			mediaType: "movie",
			tmdbId: tmdb(10),
			source: "manual",
		});
		await expect(getEffectiveSeerrTarget(aid(2))).resolves.toEqual({
			anilistId: aid(2),
			mediaType: "tv",
			tmdbId: tmdb(20),
			tvdbId: tvdb(30),
			seasons: [1, 2],
			source: "manual",
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

	it("uses one manual target without reading upstream data", async () => {
		const anilistId = aid(100);
		await setManualSeerrTarget({
			anilistId,
			mediaType: "movie",
			tmdbId: tmdb(123),
		});
		listSeerrUpstreamTargetsMock.mockResolvedValue([
			{
				anilistId,
				target: { mediaType: "movie", tmdbId: tmdb(456) },
			},
		]);

		await expect(getEffectiveSeerrTarget(anilistId)).resolves.toEqual({
			anilistId,
			mediaType: "movie",
			tmdbId: tmdb(123),
			source: "manual",
		});
		expect(listSeerrUpstreamTargetsMock).not.toHaveBeenCalled();
	});

	it("restores upstream fallback after clearing a manual target", async () => {
		const anilistId = aid(100);
		await setManualSeerrTarget({
			anilistId,
			mediaType: "movie",
			tmdbId: tmdb(123),
		});
		listSeerrUpstreamTargetsMock.mockResolvedValue([
			{
				anilistId,
				target: { mediaType: "movie", tmdbId: tmdb(456) },
			},
		]);

		await clearManualSeerrTarget(anilistId);

		await expect(getEffectiveSeerrTarget(anilistId)).resolves.toEqual({
			anilistId,
			mediaType: "movie",
			tmdbId: tmdb(456),
			source: "anibridge",
		});
		expect(listSeerrUpstreamTargetsMock).toHaveBeenCalledWith([anilistId]);
	});

	it("merges requested targets with manual precedence and sorted output", async () => {
		await setManualSeerrTarget({
			anilistId: aid(200),
			mediaType: "movie",
			tmdbId: tmdb(220),
		});
		listSeerrUpstreamTargetsMock.mockResolvedValue([
			{
				anilistId: aid(300),
				target: {
					mediaType: "tv",
					tmdbId: tmdb(330),
					tvdbId: tvdb(331),
					seasons: [0, 1],
					tmdbSeasons: [1],
					tvdbSeasons: [0],
				},
			},
			{
				anilistId: aid(200),
				target: { mediaType: "movie", tmdbId: tmdb(999) },
			},
			{
				anilistId: aid(100),
				target: { mediaType: "movie", tmdbId: tmdb(110) },
			},
		]);
		const ids = [aid(300), aid(200), aid(100), aid(300)];

		await expect(listEffectiveSeerrTargets(ids)).resolves.toEqual([
			{
				anilistId: aid(100),
				mediaType: "movie",
				tmdbId: tmdb(110),
				source: "anibridge",
			},
			{
				anilistId: aid(200),
				mediaType: "movie",
				tmdbId: tmdb(220),
				source: "manual",
			},
			{
				anilistId: aid(300),
				mediaType: "tv",
				tmdbId: tmdb(330),
				tvdbId: tvdb(331),
				seasons: [0, 1],
				tmdbSeasons: [1],
				tvdbSeasons: [0],
				source: "anibridge",
			},
		]);
		expect(listSeerrUpstreamTargetsMock).toHaveBeenCalledWith(ids);
	});

	it("lists all effective targets with manual precedence and sorted output", async () => {
		await setManualSeerrTarget({
			anilistId: aid(300),
			mediaType: "movie",
			tmdbId: tmdb(330),
		});
		await setManualSeerrTarget({
			anilistId: aid(100),
			mediaType: "movie",
			tmdbId: tmdb(110),
		});
		listAllSeerrUpstreamTargetsMock.mockResolvedValue([
			{
				anilistId: aid(300),
				target: { mediaType: "movie", tmdbId: tmdb(999) },
			},
			{
				anilistId: aid(200),
				target: { mediaType: "movie", tmdbId: tmdb(220) },
			},
		]);

		await expect(listAllEffectiveSeerrTargets()).resolves.toEqual([
			{
				anilistId: aid(100),
				mediaType: "movie",
				tmdbId: tmdb(110),
				source: "manual",
			},
			{
				anilistId: aid(200),
				mediaType: "movie",
				tmdbId: tmdb(220),
				source: "anibridge",
			},
			{
				anilistId: aid(300),
				mediaType: "movie",
				tmdbId: tmdb(330),
				source: "manual",
			},
		]);
		expect(listAllSeerrUpstreamTargetsMock).toHaveBeenCalledOnce();
	});
});
