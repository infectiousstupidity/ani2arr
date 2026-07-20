/** Tests for manual Seerr persistence and effective target precedence. */
// src/mapping/seerr-target.store.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
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
const collectEffectiveMappingRecordsMock = vi.hoisted(() => vi.fn());

vi.mock("./mapping-facts", () => ({
	collectEffectiveMappingRecords: collectEffectiveMappingRecordsMock,
}));

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
		collectEffectiveMappingRecordsMock.mockResolvedValue([]);
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
		expect(collectEffectiveMappingRecordsMock).not.toHaveBeenCalled();
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
		expect(collectEffectiveMappingRecordsMock).not.toHaveBeenCalled();
	});

	it("falls back to a direct AniList Radarr mapping", async () => {
		const anilistId = aid(100);
		collectEffectiveMappingRecordsMock.mockResolvedValue([
			{
				source: { source: "anilist", id: anilistId },
				anilistId,
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: tmdb(789),
				},
			},
		]);

		await expect(getEffectiveSeerrTarget(anilistId)).resolves.toEqual({
			anilistId,
			mediaType: "movie",
			tmdbId: tmdb(789),
			source: "radarr-mapping",
		});
		expect(listSeerrUpstreamTargetsMock).toHaveBeenCalledWith([anilistId]);
		expect(collectEffectiveMappingRecordsMock).toHaveBeenCalledWith("radarr");
	});

	it("reveals the Radarr mapping after clearing a manual target", async () => {
		const anilistId = aid(100);
		await setManualSeerrTarget({
			anilistId,
			mediaType: "movie",
			tmdbId: tmdb(123),
		});
		collectEffectiveMappingRecordsMock.mockResolvedValue([
			{
				source: { source: "anilist", id: anilistId },
				anilistId,
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "manual",
					providerId: tmdb(789),
				},
			},
		]);

		await clearManualSeerrTarget(anilistId);

		await expect(getEffectiveSeerrTarget(anilistId)).resolves.toEqual({
			anilistId,
			mediaType: "movie",
			tmdbId: tmdb(789),
			source: "radarr-mapping",
		});
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
		collectEffectiveMappingRecordsMock.mockResolvedValue([
			{
				source: { source: "anilist", id: aid(100) },
				anilistId: aid(100),
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: tmdb(999),
				},
			},
			{
				source: { source: "anilist", id: aid(200) },
				anilistId: aid(200),
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "manual",
					providerId: tmdb(998),
				},
			},
			{
				source: { source: "anilist", id: aid(400) },
				anilistId: aid(400),
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: tmdb(440),
				},
			},
			{
				source: { source: "anilist", id: aid(500) },
				anilistId: aid(500),
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: tmdb(550),
				},
			},
		]);
		const ids = [aid(400), aid(300), aid(200), aid(100), aid(300)];

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
			{
				anilistId: aid(400),
				mediaType: "movie",
				tmdbId: tmdb(440),
				source: "radarr-mapping",
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
		collectEffectiveMappingRecordsMock.mockResolvedValue([
			{
				source: { source: "anilist", id: aid(200) },
				anilistId: aid(200),
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: tmdb(999),
				},
			},
			{
				source: { source: "anilist", id: aid(400) },
				anilistId: aid(400),
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: tmdb(440),
				},
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
			{
				anilistId: aid(400),
				mediaType: "movie",
				tmdbId: tmdb(440),
				source: "radarr-mapping",
			},
		]);
		expect(listAllSeerrUpstreamTargetsMock).toHaveBeenCalledOnce();
	});

	it("ignores Radarr facts that cannot be direct mapped movie targets", async () => {
		collectEffectiveMappingRecordsMock.mockResolvedValue([
			{
				source: { source: "mal", id: parseMyAnimeListId(5114) },
				anilistId: aid(1),
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "manual",
					providerId: tmdb(10),
				},
			},
			{
				source: { source: "anilist", id: aid(2) },
				anilistId: aid(2),
				provider: "radarr",
				result: { kind: "ignored" },
			},
			{
				source: { source: "anilist", id: aid(3) },
				anilistId: aid(3),
				provider: "radarr",
				result: {
					kind: "unmapped",
					hadResolveAttempt: true,
				},
			},
			{
				source: { source: "anilist", id: aid(4) },
				anilistId: aid(4),
				provider: "radarr",
				result: {
					kind: "ambiguous",
					targets: [
						{ provider: "radarr", providerId: tmdb(40) },
						{ provider: "radarr", providerId: tmdb(41) },
					],
				},
			},
			{
				source: { source: "anilist", id: aid(5) },
				anilistId: aid(5),
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: 0,
				},
			},
		]);

		await expect(listAllEffectiveSeerrTargets()).resolves.toEqual([]);
	});

	it("does not read mapping facts for an empty batch", async () => {
		await expect(listEffectiveSeerrTargets([])).resolves.toEqual([]);
		expect(listSeerrUpstreamTargetsMock).not.toHaveBeenCalled();
		expect(collectEffectiveMappingRecordsMock).not.toHaveBeenCalled();
	});
});
