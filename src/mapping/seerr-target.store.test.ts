/** Tests for manual Seerr persistence and effective target precedence. */

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
const getSeerrAutoResultMock = vi.hoisted(() => vi.fn());
const listAniListSeerrAutoResultsMock = vi.hoisted(() => vi.fn());

vi.mock("./seerr-auto.store", () => ({
	getSeerrAutoResult: getSeerrAutoResultMock,
	listAniListSeerrAutoResults: listAniListSeerrAutoResultsMock,
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
		getSeerrAutoResultMock.mockResolvedValue(null);
		listAniListSeerrAutoResultsMock.mockResolvedValue([]);
		await clearManualSeerrTargets();
	});

	it("sets and clears only the selected linked MAL target", async () => {
		const identity = { source: "mal", id: mal(5114) } as const;
		await browser.storage.local.set({
			[MANUAL_STORAGE_KEY]: {
				"anilist:100": { mediaType: "movie", tmdbId: tmdb(999) },
				"mal:5114": { mediaType: "movie", tmdbId: tmdb(555) },
			},
		});
		await setManualSeerrTarget({
			identity,
			anilistId: aid(100),
			mediaType: "tv",
			tmdbId: tmdb(31_911),
			seasons: [1],
		});

		await expect(
			getEffectiveSeerrTarget({ identity, anilistId: aid(100) }),
		).resolves.toEqual({
			anilistId: aid(100),
			mediaType: "tv",
			tmdbId: tmdb(31_911),
			seasons: [1],
			source: "manual",
		});
		await expect(browser.storage.local.get(MANUAL_STORAGE_KEY)).resolves.toEqual({
			[MANUAL_STORAGE_KEY]: {
				"anilist:100": {
					mediaType: "tv",
					tmdbId: 31_911,
					seasons: [1],
				},
				"mal:5114": { mediaType: "movie", tmdbId: 555 },
			},
		});

		await clearManualSeerrTarget({ identity, anilistId: aid(100) });

		await expect(browser.storage.local.get(MANUAL_STORAGE_KEY)).resolves.toEqual({
			[MANUAL_STORAGE_KEY]: {
				"mal:5114": { mediaType: "movie", tmdbId: 555 },
			},
		});
	});

	it("reads a linked MAL target through its canonical AniList key", async () => {
		const identity = { source: "mal", id: mal(5114) } as const;
		await setManualSeerrTarget({
			anilistId: aid(100),
			mediaType: "movie",
			tmdbId: tmdb(123),
		});

		await expect(
			getEffectiveSeerrTarget({ identity, anilistId: aid(100) }),
		).resolves.toEqual({
			anilistId: aid(100),
			mediaType: "movie",
			tmdbId: tmdb(123),
			source: "manual",
		});
		expect(getSourceSeerrUpstreamMappingMock).not.toHaveBeenCalled();
	});

	it("reads legacy numeric AniList keys and rewrites them on mutation", async () => {
		await browser.storage.local.set({
			[MANUAL_STORAGE_KEY]: {
				"100": { mediaType: "movie", tmdbId: 1000 },
				"200": { mediaType: "movie", tmdbId: 2000 },
			},
		});

		await expect(getEffectiveSeerrTarget(aid(100))).resolves.toMatchObject({
			tmdbId: tmdb(1000),
			source: "manual",
		});
		await setManualSeerrTarget({
			anilistId: aid(300),
			mediaType: "movie",
			tmdbId: tmdb(3000),
		});

		await expect(browser.storage.local.get(MANUAL_STORAGE_KEY)).resolves.toEqual({
			[MANUAL_STORAGE_KEY]: {
				"anilist:100": { mediaType: "movie", tmdbId: 1000 },
				"anilist:200": { mediaType: "movie", tmdbId: 2000 },
				"anilist:300": { mediaType: "movie", tmdbId: 3000 },
			},
		});
	});

	it("normalizes manual TV targets without requiring a season", async () => {
		await setManualSeerrTarget({
			anilistId: aid(2),
			mediaType: "tv",
			tmdbId: tmdb(20),
			tvdbId: tvdb(30),
			seasons: [2, 1, 2],
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

	it("keeps manual and AniBridge targets ahead of cached automatic targets", async () => {
		const manualId = aid(100);
		const upstreamId = aid(200);
		await setManualSeerrTarget({
			anilistId: manualId,
			mediaType: "movie",
			tmdbId: tmdb(101),
		});
		listSeerrUpstreamTargetsMock.mockImplementation(async (ids: number[]) =>
			ids.includes(upstreamId)
				? [
						{
							anilistId: upstreamId,
							kind: "target",
							target: { mediaType: "movie", tmdbId: tmdb(202) },
						},
					]
				: [],
		);
		getSeerrAutoResultMock.mockResolvedValue({
			kind: "mapped",
			target: { mediaType: "movie", tmdbId: tmdb(999) },
		});

		await expect(getEffectiveSeerrTarget(manualId)).resolves.toMatchObject({
			tmdbId: tmdb(101),
			source: "manual",
		});
		await expect(getEffectiveSeerrTarget(upstreamId)).resolves.toMatchObject({
			tmdbId: tmdb(202),
			source: "anibridge",
		});
	});

	it("uses a cached automatic target after manual and AniBridge misses", async () => {
		const anilistId = aid(100);
		getSeerrAutoResultMock.mockResolvedValue({
			kind: "mapped",
			target: {
				mediaType: "tv",
				tmdbId: tmdb(789),
				tvdbId: tvdb(456),
			},
		});

		await expect(getEffectiveSeerrTarget(anilistId)).resolves.toEqual({
			anilistId,
			mediaType: "tv",
			tmdbId: tmdb(789),
			tvdbId: tvdb(456),
			source: "automatic",
		});
	});

	it("restores the automatic target after clearing a manual target", async () => {
		const anilistId = aid(100);
		await setManualSeerrTarget({
			anilistId,
			mediaType: "movie",
			tmdbId: tmdb(123),
		});
		getSeerrAutoResultMock.mockResolvedValue({
			kind: "mapped",
			target: { mediaType: "movie", tmdbId: tmdb(789) },
		});

		await clearManualSeerrTarget(anilistId);

		await expect(getEffectiveSeerrTarget(anilistId)).resolves.toMatchObject({
			tmdbId: tmdb(789),
			source: "automatic",
		});
	});

	it("merges batch targets with manual and AniBridge precedence", async () => {
		await setManualSeerrTarget({
			anilistId: aid(200),
			mediaType: "movie",
			tmdbId: tmdb(220),
		});
		listSeerrUpstreamTargetsMock.mockResolvedValue([
			{
				anilistId: aid(300),
				kind: "target",
				target: { mediaType: "tv", tmdbId: tmdb(330), tvdbId: tvdb(331) },
			},
		]);
		listAniListSeerrAutoResultsMock.mockResolvedValue([
			{
				anilistId: aid(200),
				result: {
					kind: "mapped",
					target: { mediaType: "movie", tmdbId: tmdb(999) },
				},
			},
			{
				anilistId: aid(400),
				result: {
					kind: "mapped",
					target: { mediaType: "movie", tmdbId: tmdb(440) },
				},
			},
		]);

		await expect(
			listEffectiveSeerrTargets([aid(400), aid(300), aid(200)]),
		).resolves.toEqual([
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
				source: "anibridge",
			},
			{
				anilistId: aid(400),
				mediaType: "movie",
				tmdbId: tmdb(440),
				source: "automatic",
			},
		]);
	});

	it("lists all effective targets and skips reads for an empty batch", async () => {
		listAllSeerrUpstreamTargetsMock.mockResolvedValue([
			{
				anilistId: aid(200),
				kind: "target",
				target: { mediaType: "movie", tmdbId: tmdb(220) },
			},
		]);

		await expect(listAllEffectiveSeerrTargets()).resolves.toEqual([
			{
				anilistId: aid(200),
				mediaType: "movie",
				tmdbId: tmdb(220),
				source: "anibridge",
			},
		]);
		await expect(listEffectiveSeerrTargets([])).resolves.toEqual([]);
		expect(listSeerrUpstreamTargetsMock).not.toHaveBeenCalled();
	});
});
