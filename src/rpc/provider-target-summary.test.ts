/** Tests for provider-specific RPC target summary DTO builders. */
// src/rpc/provider-target-summary.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist";
import { parseTmdbId, parseTvdbId } from "@/providers";
import {
	buildRadarrTargetSummary,
	buildSonarrTargetSummary,
} from "./provider-target-summary";

describe("provider target summary builders", () => {
	it("builds Sonarr mapped library summaries with route, stats, poster, and linked IDs", () => {
		const tvdbId = parseTvdbId(1001);

		const summary = buildSonarrTargetSummary({
			tvdbId,
			baseUrl: "https://sonarr.example",
			isInLibrary: true,
			linkedAniListIds: [10, 11, 10],
			series: {
				title: "Library Series",
				tvdbId,
				titleSlug: "library-series",
				folder: "/anime/Library Series",
				year: 2024,
				seriesType: "anime",
				status: "continuing",
				network: "Studio A",
				overview: "Series overview.",
				statistics: {
					episodeCount: 12,
					episodeFileCount: 8,
				},
				images: [
					{
						coverType: "poster",
						url: "/MediaCover/1001/poster.jpg",
					},
				],
			},
		});

		expect(summary).toEqual({
			provider: "sonarr",
			providerId: tvdbId,
			title: "Library Series",
			isInLibrary: true,
			providerFolderName: "/anime/Library Series",
			year: 2024,
			typeLabel: "anime",
			providerRouteSlug: "library-series",
			posterUrl: "https://sonarr.example/MediaCover/1001/poster.jpg",
			statusLabel: "continuing",
			networkOrStudio: "Studio A",
			episodeCount: 12,
			episodeFileCount: 8,
			overview: "Series overview.",
			linkedAniListIds: [parseAniListId(10), parseAniListId(11)],
		});
	});

	it("builds Sonarr lookup summaries for titles missing from the library", () => {
		const tvdbId = parseTvdbId(1002);

		const summary = buildSonarrTargetSummary({
			tvdbId,
			baseUrl: "https://sonarr.example",
			isInLibrary: false,
			series: {
				title: "Lookup Series",
				tvdbId,
				folder: "/anime/Lookup Series",
				remotePoster: "https://image.example/poster.jpg",
				statistics: {
					totalEpisodeCount: 24,
				},
			},
		});

		expect(summary).toMatchObject({
			provider: "sonarr",
			providerId: tvdbId,
			title: "Lookup Series",
			isInLibrary: false,
			providerFolderName: "/anime/Lookup Series",
			posterUrl: "https://image.example/poster.jpg",
			episodeCount: 24,
		});
	});

	it("builds Radarr mapped library summaries with route, runtime, file state, and linked IDs", () => {
		const tmdbId = parseTmdbId(2001);

		const summary = buildRadarrTargetSummary({
			tmdbId,
			baseUrl: "https://radarr.example",
			isInLibrary: true,
			linkedAniListIds: [20, 21, 20],
			movie: {
				title: "Library Movie",
				tmdbId,
				titleSlug: "library-movie",
				folderName: "Library Movie (2025)",
				year: 2025,
				status: "released",
				overview: "Movie overview.",
				alternateTitles: [{ title: "Alt Movie" }],
				runtime: 101,
				hasFile: true,
				images: [
					{
						coverType: "poster",
						url: "/MediaCover/2001/poster.jpg",
					},
				],
			},
		});

		expect(summary).toEqual({
			provider: "radarr",
			providerId: tmdbId,
			title: "Library Movie",
			isInLibrary: true,
			typeLabel: "Movie",
			providerFolderName: "Library Movie (2025)",
			year: 2025,
			providerRouteSlug: "library-movie",
			posterUrl: "https://radarr.example/MediaCover/2001/poster.jpg",
			statusLabel: "released",
			overview: "Movie overview.",
			alternateTitles: ["Alt Movie"],
			runtimeMinutes: 101,
			hasFile: true,
			linkedAniListIds: [parseAniListId(20), parseAniListId(21)],
		});
	});

	it("omits summaries when mapped status has no provider item", () => {
		expect(
			buildSonarrTargetSummary({
				tvdbId: parseTvdbId(1003),
				baseUrl: "https://sonarr.example",
				isInLibrary: null,
				series: undefined,
			}),
		).toBeNull();

		expect(
			buildRadarrTargetSummary({
				tmdbId: parseTmdbId(2003),
				baseUrl: "https://radarr.example",
				isInLibrary: null,
				movie: undefined,
			}),
		).toBeNull();
	});
});
