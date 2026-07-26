/** Tests for Seerr modal season selection and search filtering helpers. */
// src/features/media-modal/seerr/seerr-selection.test.ts

import { describe, expect, it } from "vitest";
import { parseTmdbId } from "@/providers/schemas";
import type { SeerrSearchResult, SeerrSeasonStatus } from "@/providers/seerr/types";
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
	it("defaults One Piece mapped seasons to requestable mapped seasons only", () => {
		const mappedSeasons = Array.from({ length: 22 }, (_value, index) => index + 1);
		const seasons = [
			...Array.from({ length: 10 }, (_value, index) =>
				season(index + 1, "partial"),
			),
			...Array.from({ length: 13 }, (_value, index) =>
				season(index + 11, "unknown"),
			),
		];

		expect(getDefaultSelectedSeasons({ mappedSeasons, seasons })).toEqual(
			Array.from({ length: 12 }, (_value, index) => index + 11),
		);
	});

	it("selects all requestable seasons only", () => {
		expect(
			getRequestableSeasonNumbers([
				season(1, "available"),
				season(0, "unknown"),
				season(2, "unknown"),
				season(2, "deleted"),
				season(3, "deleted"),
				season(4, "deleted-or-blocked"),
			]),
		).toEqual([0, 2, 3]);
	});

	it("leaves no default selection when no mapped seasons are requestable", () => {
		expect(
			getDefaultSelectedSeasons({
				mappedSeasons: [1, 2],
				seasons: [season(1, "available"), season(2, "pending")],
			}),
		).toEqual([]);
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

	it("ignores empty and non-relative poster paths", () => {
		expect(getTmdbPosterUrl(null)).toBeNull();
		expect(getTmdbPosterUrl("")).toBeNull();
		expect(getTmdbPosterUrl("poster.jpg")).toBeNull();
		expect(getTmdbPosterUrl("https://image.example/poster.jpg")).toBeNull();
	});
});
