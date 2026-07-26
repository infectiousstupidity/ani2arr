/** Tests for pure Seerr request payload and status helpers. */
// src/providers/seerr/request.test.ts

import { describe, expect, it } from "vitest";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import {
	buildSeerrRequestPayload,
	readSeerrMediaDetails,
	readSeerrMediaStatus,
	readSeerrPublicSettings,
	readSeerrSearchResults,
} from "./request";

describe("Seerr request helpers", () => {
	it("builds minimal movie request payloads", () => {
		expect(
			buildSeerrRequestPayload({
				mediaType: "movie",
				tmdbId: parseTmdbId(123),
			}),
		).toEqual({
			mediaType: "movie",
			mediaId: parseTmdbId(123),
		});
	});

	it("builds TV request payloads with numeric seasons or all seasons", () => {
		expect(
			buildSeerrRequestPayload({
				mediaType: "tv",
				tmdbId: parseTmdbId(456),
				tvdbId: parseTvdbId(789),
				seasons: [2, -1, 1.5, 1, 2, 0],
			}),
		).toEqual({
			mediaType: "tv",
			mediaId: parseTmdbId(456),
			tvdbId: parseTvdbId(789),
			seasons: [0, 1, 2],
		});

		expect(
			buildSeerrRequestPayload({
				mediaType: "tv",
				tmdbId: parseTmdbId(456),
				seasons: "all",
			}),
		).toEqual({
			mediaType: "tv",
			mediaId: parseTmdbId(456),
			seasons: "all",
		});
	});

	it("rejects TV request payloads without explicit seasons", () => {
		expect(() =>
			buildSeerrRequestPayload({
				mediaType: "tv",
				tmdbId: parseTmdbId(456),
			}),
		).toThrow("TV Seerr requests require explicit seasons.");

		expect(() =>
			buildSeerrRequestPayload({
				mediaType: "tv",
				tmdbId: parseTmdbId(456),
				seasons: [],
			}),
		).toThrow("TV Seerr requests require explicit seasons.");
	});

	it("rejects missing TMDB IDs", () => {
		expect(() =>
			buildSeerrRequestPayload({
				mediaType: "movie",
				tmdbId: null,
			}),
		).toThrow("Invalid TMDB ID");
	});

	it("reads Seerr media status from details responses", () => {
		expect(readSeerrMediaStatus({})).toBe("not-requested");
		expect(readSeerrMediaStatus({ mediaInfo: { status: 1 } })).toBe("unknown");
		expect(readSeerrMediaStatus({ mediaInfo: { status: 2 } })).toBe("pending");
		expect(readSeerrMediaStatus({ mediaInfo: { status: 3 } })).toBe(
			"processing",
		);
		expect(readSeerrMediaStatus({ mediaInfo: { status: 4 } })).toBe("partial");
		expect(readSeerrMediaStatus({ mediaInfo: { status: 5 } })).toBe(
			"available",
		);
		expect(readSeerrMediaStatus({ mediaInfo: { status: 6 } })).toBe(
			"deleted-or-blocked",
		);
		expect(readSeerrMediaStatus({ mediaInfo: { status: 7 } })).toBe("deleted");
	});

	it("reads TV season status when all target seasons are available", () => {
		expect(
			readSeerrMediaStatus(
				{
					mediaInfo: {
						status: 4,
						seasons: [
							{ seasonNumber: 1, status: 5 },
							{ seasonNumber: 2, status: 5 },
						],
					},
				},
				{ mediaType: "tv", seasons: [1, 2] },
			),
		).toBe("available");
	});

	it("lets top-level available win for explicit TV season targets", () => {
		expect(
			readSeerrMediaStatus(
				{
					mediaInfo: {
						status: 5,
						requests: [
							{
								status: 2,
								seasons: [{ seasonNumber: 1 }],
							},
						],
					},
				},
				{ mediaType: "tv", seasons: [1] },
			),
		).toBe("available");
	});

	it("falls back to top-level TV status when season rows are absent", () => {
		expect(
			readSeerrMediaStatus(
				{
					mediaInfo: {
						status: 4,
						requests: [
							{
								status: 2,
								seasons: [{ seasonNumber: 1 }],
							},
						],
					},
				},
				{ mediaType: "tv", seasons: [1] },
			),
		).toBe("partial");
	});

	it("reads TV season status from active requests", () => {
		expect(
			readSeerrMediaStatus(
				{
					mediaInfo: {
						status: 2,
						requests: [
							{
								status: 2,
								seasons: [{ seasonNumber: 1 }, { seasonNumber: 2 }],
							},
						],
					},
				},
				{ mediaType: "tv", seasons: [1, 2] },
			),
		).toBe("pending");
	});

	it("keeps TV requestable when any target season is uncovered", () => {
		expect(
			readSeerrMediaStatus(
				{
					mediaInfo: {
						status: 4,
						seasons: [{ seasonNumber: 1, status: 5 }],
						requests: [
							{
								status: 2,
								seasons: [{ seasonNumber: 1 }],
							},
						],
					},
				},
				{ mediaType: "tv", seasons: [1, 2] },
			),
		).toBe("not-requested");
	});

	it("keeps TV requestable when a target season is unknown in Seerr", () => {
		expect(
			readSeerrMediaStatus(
				{
					mediaInfo: {
						status: 4,
						seasons: [
							{ seasonNumber: 1, status: 4 },
							{ seasonNumber: 23, status: 1 },
						],
					},
				},
				{ mediaType: "tv", seasons: [23] },
			),
		).toBe("not-requested");
	});

	it("blocks TV requests when a target season is blocked or deleted in older Seerr responses", () => {
		expect(
			readSeerrMediaStatus(
				{
					mediaInfo: {
						status: 4,
						seasons: [{ seasonNumber: 1, status: 6 }],
					},
				},
				{ mediaType: "tv", seasons: [1] },
			),
		).toBe("deleted-or-blocked");
	});

	it("allows TV requests again when a target season is deleted in current Seerr responses", () => {
		expect(
			readSeerrMediaStatus(
				{
					mediaInfo: {
						status: 4,
						seasons: [{ seasonNumber: 1, status: 7 }],
					},
				},
				{ mediaType: "tv", seasons: [1] },
			),
		).toBe("not-requested");
	});

	it("maps Seerr search responses to small DTOs", () => {
		expect(
			readSeerrSearchResults({
				results: [
					{
						id: 123,
						mediaType: "movie",
						title: "Movie",
						originalTitle: " Original Movie ",
						releaseDate: "2024-01-01",
						posterPath: "/poster.jpg",
						overview: "Overview",
					},
					{
						id: 456,
						mediaType: "tv",
						name: "Show",
						originalName: "Original Show",
						firstAirDate: "2023-05-01",
					},
					{
						id: 789,
						mediaType: "person",
						name: "Person",
					},
				],
			}),
		).toEqual([
			{
				mediaType: "movie",
				tmdbId: parseTmdbId(123),
				title: "Movie",
				alternateTitles: ["Original Movie"],
				year: 2024,
				posterPath: "/poster.jpg",
				overview: "Overview",
			},
			{
				mediaType: "tv",
				tmdbId: parseTmdbId(456),
				title: "Show",
				alternateTitles: ["Original Show"],
				year: 2023,
			},
		]);
	});

	it("maps Seerr details and season requestability", () => {
		expect(
			readSeerrMediaDetails(
				{
					id: 456,
					externalIds: { tvdbId: 789 },
					name: "Show",
					originalName: "Original Show",
					firstAirDate: "2020-01-01",
					mediaInfo: { status: 4 },
					seasons: [
						{ seasonNumber: 1, name: "Season 1", episodeCount: 12, status: 5 },
						{ seasonNumber: 2, status: 1 },
						{ seasonNumber: 3, status: 7 },
						{ seasonNumber: 4, status: 6 },
					],
				},
				"tv",
			),
		).toEqual({
			mediaType: "tv",
			tmdbId: parseTmdbId(456),
			tvdbId: parseTvdbId(789),
			title: "Show",
			alternateTitles: ["Original Show"],
			year: 2020,
			status: "partial",
			seasons: [
				{
					seasonNumber: 1,
					name: "Season 1",
					episodeCount: 12,
					status: "available",
					requestable: false,
				},
				{
					seasonNumber: 2,
					status: "unknown",
					requestable: true,
				},
				{
					seasonNumber: 3,
					status: "deleted",
					requestable: true,
				},
				{
					seasonNumber: 4,
					status: "deleted-or-blocked",
					requestable: false,
				},
			],
		});
	});

	it("merges Seerr season metadata with mediaInfo season statuses", () => {
		expect(
			readSeerrMediaDetails(
				{
					id: 37_854,
					tvdbId: 81_797,
					name: "One Piece",
					firstAirDate: "1999-10-20",
					mediaInfo: {
						status: 4,
						seasons: [
							{ seasonNumber: 1, status: 4 },
							{ seasonNumber: 2, status: 4 },
							{ seasonNumber: 11, status: 1 },
						],
					},
					seasons: [
						{ seasonNumber: 0, name: "Specials", episodeCount: 39 },
						{ seasonNumber: 1, name: "East Blue", episodeCount: 61 },
						{
							seasonNumber: 2,
							name: "Whiskey Peak & Little Garden",
							episodeCount: 16,
						},
						{
							seasonNumber: 11,
							name: "Sabaody Archipelago",
							episodeCount: 26,
						},
					],
				},
				"tv",
			).seasons,
		).toEqual([
			{
				seasonNumber: 0,
				name: "Specials",
				episodeCount: 39,
				status: "not-requested",
				requestable: true,
			},
			{
				seasonNumber: 1,
				name: "East Blue",
				episodeCount: 61,
				status: "partial",
				requestable: false,
			},
			{
				seasonNumber: 2,
				name: "Whiskey Peak & Little Garden",
				episodeCount: 16,
				status: "partial",
				requestable: false,
			},
			{
				seasonNumber: 11,
				name: "Sabaody Archipelago",
				episodeCount: 26,
				status: "unknown",
				requestable: true,
			},
		]);
	});

	it("reads only supported Seerr public settings with safe defaults", () => {
		expect(
			readSeerrPublicSettings({
				partialRequestsEnabled: false,
				enableSpecialEpisodes: true,
				applicationTitle: "Private Seerr",
			}),
		).toEqual({
			partialRequestsEnabled: false,
			enableSpecialEpisodes: true,
		});
		expect(readSeerrPublicSettings({})).toEqual({
			partialRequestsEnabled: true,
			enableSpecialEpisodes: false,
		});
	});
});

it("ignores zero-episode Seerr seasons", () => {
	expect(
		readSeerrMediaDetails(
			{
				id: 196_950,
				externalIds: { tvdbId: 418_666 },
				name: "Witch Hat Atelier",
				firstAirDate: "2026-01-01",
				mediaInfo: { status: 4 },
				seasons: [
					{ seasonNumber: 0, name: "0", episodeCount: 0 },
					{ seasonNumber: 1, name: "1", episodeCount: 13, status: 4 },
				],
			},
			"tv",
		).seasons,
	).toEqual([
		{
			seasonNumber: 1,
			name: "1",
			episodeCount: 13,
			status: "partial",
			requestable: false,
		},
	]);
});
