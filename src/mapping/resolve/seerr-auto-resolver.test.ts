/** Focused behavior tests for source-native Seerr automatic resolution. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import type { SeerrAutoResult } from "@/mapping/seerr-auto.store";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import { createSeerrAutoResolver } from "./seerr-auto-resolver";

const source = {
	source: "anilist",
	id: parseAniListId(21_003),
} as const;

function requireMappedResult(
	result: SeerrAutoResult | null,
): Extract<SeerrAutoResult, { kind: "mapped" }> {
	if (result?.kind !== "mapped") throw new Error("Expected a mapped result.");
	return result;
}

describe("Seerr automatic resolver", () => {
	let cached: SeerrAutoResult | null;
	const getEffectiveTarget = vi.fn();
	const getAutoResult = vi.fn();
	const setAutoResult = vi.fn();
	const loadAniListMedia = vi.fn();
	const loadMyAnimeListMetadata = vi.fn();
	const searchMedia = vi.fn();
	const getTvDetails = vi.fn();

	const resolve = createSeerrAutoResolver({
		getEffectiveTarget,
		getAutoResult,
		setAutoResult,
		loadAniListMedia,
		loadMyAnimeListMetadata,
		searchMedia,
		getTvDetails,
	});

	beforeEach(() => {
		vi.clearAllMocks();
		cached = null;
		getEffectiveTarget.mockResolvedValue(null);
		getAutoResult.mockImplementation(async () => cached);
		setAutoResult.mockImplementation(
			async (_source: unknown, result: SeerrAutoResult) => {
				cached = result;
			},
		);
		loadAniListMedia.mockRejectedValue(new Error("not needed"));
		loadMyAnimeListMetadata.mockRejectedValue(new Error("not needed"));
	});

	it("stores one confident movie search result", async () => {
		searchMedia.mockResolvedValue([
			{
				mediaType: "tv",
				tmdbId: parseTmdbId(100),
				title: "Perfect Blue",
				year: 1998,
			},
			{
				mediaType: "movie",
				tmdbId: parseTmdbId(10_494),
				title: "Perfect Blue",
				year: 1998,
			},
		]);

		await expect(
			resolve({
				source,
				title: "Perfect Blue",
				metadata: { format: "MOVIE", startYear: 1998 },
			}),
		).resolves.toEqual({
			source: "automatic",
			mediaType: "movie",
			tmdbId: parseTmdbId(10_494),
		});
		expect(cached).toEqual({
			kind: "mapped",
			target: { mediaType: "movie", tmdbId: parseTmdbId(10_494) },
			matchedTitle: "Perfect Blue",
		});
		expect(getTvDetails).not.toHaveBeenCalled();
	});

	it("fetches TV details and stores the TVDB ID", async () => {
		searchMedia.mockResolvedValue([
			{
				mediaType: "tv",
				tmdbId: parseTmdbId(209_867),
				title: "Frieren: Beyond Journey's End",
				year: 2023,
			},
		]);
		getTvDetails.mockResolvedValue({
			mediaType: "tv",
			tmdbId: parseTmdbId(209_867),
			tvdbId: parseTvdbId(424_536),
			title: "Frieren: Beyond Journey's End",
			status: "unknown",
			seasons: [],
		});

		await expect(
			resolve({
				source,
				title: "Frieren: Beyond Journey's End",
				metadata: { format: "TV", startYear: 2023 },
			}),
		).resolves.toMatchObject({
			mediaType: "tv",
			tmdbId: parseTmdbId(209_867),
			tvdbId: parseTvdbId(424_536),
		});
		expect(getTvDetails).toHaveBeenCalledWith(parseTmdbId(209_867));
		expect(cached).toMatchObject({
			kind: "mapped",
			target: { tvdbId: parseTvdbId(424_536) },
		});
	});

	it("retains explicit Season 3 only when TV details contain it", async () => {
		searchMedia.mockResolvedValue([
			{
				mediaType: "tv",
				tmdbId: parseTmdbId(31_911),
				title: "Fullmetal Alchemist",
				year: 2003,
			},
		]);
		getTvDetails.mockResolvedValue({
			mediaType: "tv",
			tmdbId: parseTmdbId(31_911),
			title: "Fullmetal Alchemist",
			status: "unknown",
			seasons: [
				{
					seasonNumber: 1,
					status: "not-requested",
					requestable: true,
				},
				{
					seasonNumber: 3,
					status: "not-requested",
					requestable: true,
				},
			],
		});

		await resolve({
			source,
			title: "Fullmetal Alchemist Season 3",
			metadata: { format: "TV", startYear: 2003 },
		});

		expect(cached).toMatchObject({
			kind: "mapped",
			target: { seasons: [3] },
		});

		cached = null;
		getTvDetails.mockResolvedValue({
			mediaType: "tv",
			tmdbId: parseTmdbId(31_911),
			title: "Fullmetal Alchemist",
			status: "unknown",
			seasons: [
				{
					seasonNumber: 1,
					status: "not-requested",
					requestable: true,
				},
			],
		});
		await resolve({
			source: { source: "anilist", id: parseAniListId(21_004) },
			title: "Fullmetal Alchemist Season 3",
			metadata: { format: "TV", startYear: 2003 },
		});

		expect(
			requireMappedResult(cached).target,
		).not.toHaveProperty("seasons");
	});

	it("stores an unclear part title as a show-only target", async () => {
		searchMedia.mockResolvedValue([
			{
				mediaType: "tv",
				tmdbId: parseTmdbId(1429),
				title: "Attack on Titan",
				year: 2013,
			},
		]);
		getTvDetails.mockResolvedValue({
			mediaType: "tv",
			tmdbId: parseTmdbId(1429),
			title: "Attack on Titan",
			status: "unknown",
			seasons: [
				{
					seasonNumber: 2,
					status: "not-requested",
					requestable: true,
				},
			],
		});

		await resolve({
			source,
			title: "Attack on Titan Part 2",
			metadata: { format: "TV", startYear: 2013 },
		});

		expect(cached).toMatchObject({
			kind: "mapped",
			target: { mediaType: "tv", tmdbId: parseTmdbId(1429) },
		});
		expect(
			requireMappedResult(cached).target,
		).not.toHaveProperty("seasons");
	});

	it("returns fresh mapped results without another search", async () => {
		cached = {
			kind: "mapped",
			target: { mediaType: "movie", tmdbId: parseTmdbId(10_494) },
		};

		await expect(
			resolve({
				source,
				title: "Perfect Blue",
				metadata: { format: "MOVIE" },
			}),
		).resolves.toEqual({
			source: "automatic",
			mediaType: "movie",
			tmdbId: parseTmdbId(10_494),
		});
		expect(searchMedia).not.toHaveBeenCalled();
	});

	it("retries after metadata enrichment changes an earlier null result", async () => {
		searchMedia.mockResolvedValue([]);
		await expect(
			resolve({
				source,
				title: "Unknown anime",
			}),
		).resolves.toBeNull();
		expect(cached).toEqual({ kind: "unmapped" });

		searchMedia.mockResolvedValue([
			{
				mediaType: "movie",
				tmdbId: parseTmdbId(10_494),
				title: "Perfect Blue",
				year: 1998,
			},
		]);
		await expect(
			resolve({
				source,
				title: "Perfect Blue",
				metadata: { format: "MOVIE", startYear: 1998 },
			}),
		).resolves.toMatchObject({ tmdbId: parseTmdbId(10_494) });
		expect(searchMedia).toHaveBeenCalledWith("Perfect Blue");
	});

	it("force retries an earlier null result", async () => {
		cached = { kind: "unmapped" };
		searchMedia.mockResolvedValue([
			{
				mediaType: "movie",
				tmdbId: parseTmdbId(10_494),
				title: "Perfect Blue",
				year: 1998,
			},
		]);

		await expect(
			resolve({
				source,
				title: "Perfect Blue",
				metadata: { format: "MOVIE", startYear: 1998 },
				forceRetry: true,
			}),
		).resolves.toMatchObject({ tmdbId: parseTmdbId(10_494) });
		expect(searchMedia).toHaveBeenCalledWith("Perfect Blue");
	});
});
