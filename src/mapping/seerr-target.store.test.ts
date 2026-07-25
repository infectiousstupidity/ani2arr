/** Tests for manual Seerr persistence and effective target precedence. */
// src/mapping/seerr-target.store.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
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
const getSourceSeerrUpstreamMappingMock = vi.hoisted(() => vi.fn());
const collectEffectiveMappingRecordsMock = vi.hoisted(() => vi.fn());

vi.mock("./mapping-facts", () => ({
	collectEffectiveMappingRecords: collectEffectiveMappingRecordsMock,
}));

vi.mock("./upstream.store", () => ({
	getSourceSeerrUpstreamMapping: getSourceSeerrUpstreamMappingMock,
	listSeerrUpstreamTargets: listSeerrUpstreamTargetsMock,
	listAllSeerrUpstreamTargets: listAllSeerrUpstreamTargetsMock,
}));

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;
const MANUAL_STORAGE_KEY = "mapping:seerr-targets";

describe("Seerr targets", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		listSeerrUpstreamTargetsMock.mockResolvedValue([]);
		listAllSeerrUpstreamTargetsMock.mockResolvedValue([]);
		getSourceSeerrUpstreamMappingMock.mockResolvedValue({
			anilistId: null,
			kind: "missing",
		});
		collectEffectiveMappingRecordsMock.mockResolvedValue([]);
		await clearManualSeerrTargets();
	});

	it("stores and clears a source-only MAL target", async () => {
		const identity = { source: "mal", id: mal(5114) } as const;
		await setManualSeerrTarget({
			identity,
			mediaType: "tv",
			tmdbId: tmdb(31_911),
			seasons: [1],
		});

		await expect(getEffectiveSeerrTarget({ identity })).resolves.toEqual({
			mediaType: "tv",
			tmdbId: tmdb(31_911),
			seasons: [1],
			source: "manual",
		});
		await expect(
			browser.storage.local.get(MANUAL_STORAGE_KEY),
		).resolves.toEqual({
			[MANUAL_STORAGE_KEY]: {
				"mal:5114": {
					mediaType: "tv",
					tmdbId: 31_911,
					seasons: [1],
				},
			},
		});

		await clearManualSeerrTarget({ identity });
		await expect(getEffectiveSeerrTarget({ identity })).resolves.toBeNull();
		expect(getSourceSeerrUpstreamMappingMock).toHaveBeenCalledWith(identity);
	});

	it("reads legacy numeric AniList keys and rewrites them on mutation", async () => {
		await browser.storage.local.set({
			[MANUAL_STORAGE_KEY]: {
				"100": { mediaType: "movie", tmdbId: 1000 },
				"200": { mediaType: "movie", tmdbId: 2000 },
			},
		});

		await expect(getEffectiveSeerrTarget(aid(100))).resolves.toEqual({
			anilistId: aid(100),
			mediaType: "movie",
			tmdbId: tmdb(1000),
			source: "manual",
		});
		await setManualSeerrTarget({
			anilistId: aid(300),
			mediaType: "movie",
			tmdbId: tmdb(3000),
		});

		await expect(
			browser.storage.local.get(MANUAL_STORAGE_KEY),
		).resolves.toEqual({
			[MANUAL_STORAGE_KEY]: {
				"anilist:100": { mediaType: "movie", tmdbId: 1000 },
				"anilist:200": { mediaType: "movie", tmdbId: 2000 },
				"anilist:300": { mediaType: "movie", tmdbId: 3000 },
			},
		});
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
				kind: "target",
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
				kind: "target",
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

	it("does not fall through conflicting MAL facts to a Radarr mapping", async () => {
		const identity = { source: "mal", id: mal(5114) } as const;
		const anilistId = aid(100);
		getSourceSeerrUpstreamMappingMock.mockResolvedValue({
			anilistId,
			kind: "conflict",
		});
		collectEffectiveMappingRecordsMock.mockResolvedValue([
			{
				anilistId,
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: tmdb(789),
				},
			},
		]);

		await expect(
			getEffectiveSeerrTarget({ identity, anilistId }),
		).resolves.toBeNull();
		expect(collectEffectiveMappingRecordsMock).not.toHaveBeenCalled();
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
				kind: "target",
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
				kind: "target",
				target: { mediaType: "movie", tmdbId: tmdb(999) },
			},
			{
				anilistId: aid(100),
				kind: "target",
				target: { mediaType: "movie", tmdbId: tmdb(110) },
			},
		]);
		collectEffectiveMappingRecordsMock.mockResolvedValue([
			{
				anilistId: aid(100),
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: tmdb(999),
				},
			},
			{
				anilistId: aid(200),
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "manual",
					providerId: tmdb(998),
				},
			},
			{
				anilistId: aid(400),
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: tmdb(440),
				},
			},
			{
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
				kind: "target",
				target: { mediaType: "movie", tmdbId: tmdb(999) },
			},
			{
				anilistId: aid(200),
				kind: "target",
				target: { mediaType: "movie", tmdbId: tmdb(220) },
			},
		]);
		collectEffectiveMappingRecordsMock.mockResolvedValue([
			{
				anilistId: aid(200),
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: tmdb(999),
				},
			},
			{
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

	it("does not use a batch Radarr fallback for conflicting upstream facts", async () => {
		const anilistId = aid(100);
		listSeerrUpstreamTargetsMock.mockResolvedValue([
			{ anilistId, kind: "conflict" },
		]);
		collectEffectiveMappingRecordsMock.mockResolvedValue([
			{
				anilistId,
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: tmdb(789),
				},
			},
		]);

		await expect(listEffectiveSeerrTargets([anilistId])).resolves.toEqual([]);
	});

	it("ignores Radarr facts that cannot be direct mapped movie targets", async () => {
		collectEffectiveMappingRecordsMock.mockResolvedValue([
			{
				anilistId: aid(2),
				provider: "radarr",
				result: { kind: "ignored" },
			},
			{
				anilistId: aid(3),
				provider: "radarr",
				result: {
					kind: "unmapped",
					hadResolveAttempt: true,
				},
			},
			{
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
