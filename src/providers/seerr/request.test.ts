/** Tests for pure Seerr request payload and status helpers. */
// src/providers/seerr/request.test.ts

import { describe, expect, it } from "vitest";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import {
	buildSeerrRequestPayload,
	readSeerrMediaDetails,
	readSeerrMediaStatus,
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

		expect(() =>
			buildSeerrRequestPayload({
				mediaType: "tv",
				tmdbId: parseTmdbId(456),
				seasons: [-1, 1.5],
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
		expect(readSeerrMediaStatus({})).toEqual({
			target: "not-requested",
			overall: "not-requested",
		});
		expect(readSeerrMediaStatus({ mediaInfo: { status: 1 } })).toEqual({
			target: "unknown",
			overall: "unknown",
		});
		expect(readSeerrMediaStatus({ mediaInfo: { status: 2 } })).toEqual({
			target: "pending",
			overall: "pending",
		});
		expect(readSeerrMediaStatus({ mediaInfo: { status: 3 } })).toEqual({
			target: "processing",
			overall: "processing",
		});
		expect(readSeerrMediaStatus({ mediaInfo: { status: 4 } })).toEqual({
			target: "partial",
			overall: "partial",
		});
		expect(readSeerrMediaStatus({ mediaInfo: { status: 5 } })).toEqual({
			target: "available",
			overall: "available",
		});
		expect(readSeerrMediaStatus({ mediaInfo: { status: 6 } })).toEqual({
			target: "deleted-or-blocked",
			overall: "deleted-or-blocked",
		});
		expect(readSeerrMediaStatus({ mediaInfo: { status: 7 } })).toEqual({
			target: "deleted",
			overall: "deleted",
		});
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
		).toEqual({ target: "available", overall: "partial" });
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
		).toEqual({ target: "available", overall: "available" });
	});

	it("keeps overall partial when the mapped season is missing", () => {
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
		).toEqual({ target: "not-requested", overall: "partial" });
	});

	it("derives overall partial when only another season row is available", () => {
		expect(
			readSeerrMediaStatus(
				{
					mediaInfo: {
						status: 1,
						seasons: [{ seasonNumber: 3, status: 5 }],
					},
					seasons: [
						{ seasonNumber: 1 },
						{ seasonNumber: 2 },
						{ seasonNumber: 3 },
					],
				},
				{ mediaType: "tv", seasons: [1] },
			),
		).toEqual({ target: "not-requested", overall: "partial" });
	});

	it("keeps overall pending separate when mapped season rows are absent", () => {
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
		).toEqual({ target: "not-requested", overall: "pending" });
	});

	it("treats one explicitly mapped partial season as available", () => {
		expect(
			readSeerrMediaStatus(
				{
					mediaInfo: {
						status: 4,
						seasons: [{ seasonNumber: 3, status: 4 }],
					},
				},
				{ mediaType: "tv", seasons: [3] },
			),
		).toEqual({ target: "available", overall: "partial" });
	});

	it("keeps a multi-season target partial", () => {
		expect(
			readSeerrMediaStatus(
				{
					mediaInfo: {
						status: 4,
						seasons: [
							{ seasonNumber: 1, status: 5 },
							{ seasonNumber: 2, status: 4 },
						],
					},
				},
				{ mediaType: "tv", seasons: [1, 2] },
			),
		).toEqual({ target: "partial", overall: "partial" });
	});

	it.each([
		{
			caseName: "one mapped season is missing",
			seasons: [{ seasonNumber: 1, status: 5 }],
			targetSeasons: [1, 2],
		},
		{
			caseName: "the mapped season is unknown",
			seasons: [
				{ seasonNumber: 1, status: 4 },
				{ seasonNumber: 23, status: 1 },
			],
			targetSeasons: [23],
		},
		{
			caseName: "the mapped season was deleted",
			seasons: [{ seasonNumber: 1, status: 7 }],
			targetSeasons: [1],
		},
	])(
		"keeps $caseName requestable while the overall title is partial",
		({ seasons, targetSeasons }) => {
			expect(
				readSeerrMediaStatus(
					{
						mediaInfo: {
							status: 4,
							seasons,
						},
					},
					{
						mediaType: "tv",
						seasons: targetSeasons,
					},
				),
			).toEqual({ target: "not-requested", overall: "partial" });
		},
	);

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
		).toEqual({ target: "deleted-or-blocked", overall: "partial" });
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
						{
							seasonNumber: 1,
							name: "Season 1",
							episodeCount: 12,
							status: 5,
						},
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
						{
							seasonNumber: 0,
							name: "Specials",
							episodeCount: 39,
						},
						{
							seasonNumber: 1,
							name: "East Blue",
							episodeCount: 61,
						},
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
});

it("ignores zero-episode Seerr seasons", () => {
	expect(
		readSeerrMediaDetails(
			{
				id: 196_950,
				tvdbId: 418_666,
				name: "Witch Hat Atelier",
				firstAirDate: "2026-01-01",
				mediaInfo: { status: 4 },
				seasons: [
					{
						seasonNumber: 0,
						name: "0",
						episodeCount: 0,
					},
					{
						seasonNumber: 1,
						name: "1",
						episodeCount: 13,
						status: 4,
					},
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
