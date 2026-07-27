import { describe, expect, it } from "vitest";
import { parseTmdbId } from "@/providers/schemas";
import type {
	SeerrSearchResult,
	SeerrSeasonStatus,
} from "@/providers/seerr/types";
import {
	filterSeerrSearchResults,
	getDefaultSelectedSeasons,
	getExpectedSeerrMediaType,
	getRequestableSeasonNumbers,
	getTmdbPosterUrl,
	summarizeSeerrSeasonAvailability,
} from "./seerr-selection";

function season(
	seasonNumber: number,
	status: SeerrSeasonStatus["status"],
): SeerrSeasonStatus {
	return {
		seasonNumber,
		status,
		requestable: ["unknown", "deleted", "not-requested"].includes(status),
	};
}

describe("Seerr season selection helpers", () => {
	it("defaults to selectable mapped seasons only", () => {
		expect(
			getDefaultSelectedSeasons({
				mappedSeasons: [1, 2],
				seasons: [
					season(1, "partial"),
					season(2, "unknown"),
					season(3, "unknown"),
				],
			}),
		).toEqual([1, 2]);
	});

	it("selects all selectable seasons only", () => {
		expect(
			getRequestableSeasonNumbers([
				season(0, "unknown"),
				season(1, "partial"),
				season(2, "unknown"),
				season(2, "deleted"),
				season(3, "available"),
			]),
		).toEqual([0, 1, 2]);
	});

	it("summarizes availability counts from Seerr season rows", () => {
		expect(
			summarizeSeerrSeasonAvailability([
				{ ...season(1, "available"), episodeCount: 12 },
				{ ...season(2, "partial"), episodeCount: 10 },
				{ ...season(3, "not-requested"), episodeCount: 8 },
				{ ...season(4, "pending") },
				{ ...season(5, "processing") },
			]),
		).toEqual({
			availableSeasonCount: 1,
			partialSeasonCount: 1,
			requestableSeasonCount: 1,
			pendingSeasonCount: 2,
			episodeCount: 30,
		});
	});
});

describe("Seerr search filtering helpers", () => {
	const results: SeerrSearchResult[] = [
		{ mediaType: "movie", tmdbId: parseTmdbId(1), title: "Movie" },
		{ mediaType: "tv", tmdbId: parseTmdbId(2), title: "Show" },
	];

	it("uses expected type from current target before AniList format", () => {
		expect(
			getExpectedSeerrMediaType({
				currentTargetMediaType: "tv",
				format: "MOVIE",
			}),
		).toBe("tv");
	});

	it("maps AniList formats to Seerr media types", () => {
		expect(getExpectedSeerrMediaType({ format: "MOVIE" })).toBe("movie");
		expect(getExpectedSeerrMediaType({ format: "OVA" })).toBe("tv");
		expect(getExpectedSeerrMediaType({ format: "MANGA" })).toBeNull();
	});

	it("falls back to all search results when expected type has no results", () => {
		expect(
			filterSeerrSearchResults({
				results: [results[0] as SeerrSearchResult],
				expectedMediaType: "tv",
			}),
		).toEqual([results[0]]);
	});

	it("filters search results when expected type exists", () => {
		expect(
			filterSeerrSearchResults({ results, expectedMediaType: "tv" }),
		).toEqual([results[1]]);
	});
});

describe("Seerr poster helpers", () => {
	it("builds secure TMDB poster URLs from relative paths", () => {
		expect(getTmdbPosterUrl("/poster.jpg")).toBe(
			"https://image.tmdb.org/t/p/w342/poster.jpg",
		);
	});

	it("ignores missing and external poster paths", () => {
		expect(getTmdbPosterUrl(null)).toBeNull();
		expect(getTmdbPosterUrl("https://image.example/poster.jpg")).toBeNull();
	});
});
