/** Tests for pure Seerr request payload and status helpers. */
import { describe, expect, it } from "vitest";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import {
	buildSeerrRequestPayload,
	readSeerrMediaDetails,
	readSeerrMediaStatus,
	readSeerrPublicSettings,
	readSeerrSearchResults,
} from "./request";

function readTvStatus(mediaInfo: object, seasons: number[] = [1]) {
	return readSeerrMediaStatus({ mediaInfo }, { mediaType: "tv", seasons });
}

function readSeason(status: number) {
	return readSeerrMediaDetails(
		{ id: 456, name: "Show", seasons: [{ seasonNumber: 1, status }] },
		"tv",
	).seasons?.[0];
}

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

	it.each([
		{ status: undefined, expected: "not-requested" },
		{ status: 1, expected: "unknown" },
		{ status: 2, expected: "pending" },
		{ status: 3, expected: "processing" },
		{ status: 4, expected: "partial" },
		{ status: 5, expected: "available" },
		{ status: 6, expected: "deleted-or-blocked" },
		{ status: 7, expected: "deleted" },
	] as const)(
		"maps Seerr status $status to $expected",
		({ status, expected }) => {
			expect(
				readSeerrMediaStatus(
					status === undefined ? {} : { mediaInfo: { status } },
				),
			).toBe(expected);
		},
	);

	it.each([
		{
			name: "all target seasons are available",
			mediaInfo: {
				status: 4,
				seasons: [
					{ seasonNumber: 1, status: 5 },
					{ seasonNumber: 2, status: 5 },
				],
			},
			seasons: [1, 2],
			expected: "available",
		},
		{
			name: "top-level status is available",
			mediaInfo: { status: 5 },
			seasons: [1],
			expected: "available",
		},
		{
			name: "season rows are absent",
			mediaInfo: { status: 4 },
			seasons: [1],
			expected: "partial",
		},
		{
			name: "an unknown season has an active request",
			mediaInfo: {
				status: 2,
				seasons: [{ seasonNumber: 1, status: 1 }],
				requests: [{ status: 2, seasons: [{ seasonNumber: 1 }] }],
			},
			seasons: [1],
			expected: "pending",
		},
		{
			name: "any target season is uncovered",
			mediaInfo: {
				status: 4,
				seasons: [{ seasonNumber: 1, status: 5 }],
			},
			seasons: [1, 2],
			expected: "not-requested",
		},
		{
			name: "the target season is unknown",
			mediaInfo: {
				status: 4,
				seasons: [{ seasonNumber: 23, status: 1 }],
			},
			seasons: [23],
			expected: "not-requested",
		},
		{
			name: "an older response marks the target blocked",
			mediaInfo: {
				status: 4,
				seasons: [{ seasonNumber: 1, status: 6 }],
			},
			seasons: [1],
			expected: "deleted-or-blocked",
		},
		{
			name: "a current response marks the target deleted",
			mediaInfo: {
				status: 4,
				seasons: [{ seasonNumber: 1, status: 7 }],
			},
			seasons: [1],
			expected: "not-requested",
		},
	] as const)(
		"reads TV status when $name",
		({ mediaInfo, seasons, expected }) => {
			expect(readTvStatus(mediaInfo, [...seasons])).toBe(expected);
		},
	);

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

	it("maps Seerr details to a small DTO", () => {
		expect(
			readSeerrMediaDetails(
				{
					id: 456,
					externalIds: { tvdbId: 789 },
					name: "Show",
					originalName: "Original Show",
					firstAirDate: "2020-01-01",
					mediaInfo: { status: 4 },
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
			seasons: [],
		});
	});

	it.each([
		{ code: 1, status: "unknown", requestable: true },
		{ code: 5, status: "available", requestable: false },
		{ code: 6, status: "deleted-or-blocked", requestable: false },
		{ code: 7, status: "deleted", requestable: true },
	] as const)(
		"maps season status $code to $status",
		({ code, status, requestable }) => {
			expect(readSeason(code)).toMatchObject({ status, requestable });
		},
	);

	it("merges Seerr season metadata with mediaInfo season statuses", () => {
		expect(
			readSeerrMediaDetails(
				{
					id: 456,
					name: "Show",
					mediaInfo: {
						status: 4,
						seasons: [{ seasonNumber: 1, status: 4 }],
					},
					seasons: [
						{ seasonNumber: 0, name: "Specials", episodeCount: 2 },
						{ seasonNumber: 1, name: "Season 1", episodeCount: 12 },
					],
				},
				"tv",
			).seasons,
		).toEqual([
			{
				seasonNumber: 0,
				name: "Specials",
				episodeCount: 2,
				status: "not-requested",
				requestable: true,
			},
			{
				seasonNumber: 1,
				name: "Season 1",
				episodeCount: 12,
				status: "partial",
				requestable: false,
			},
		]);
	});

	it("ignores zero-episode Seerr seasons", () => {
		expect(
			readSeerrMediaDetails(
				{
					id: 456,
					name: "Show",
					seasons: [
						{ seasonNumber: 0, episodeCount: 0 },
						{ seasonNumber: 1, episodeCount: 12 },
					],
				},
				"tv",
			).seasons,
		).toEqual([
			{
				seasonNumber: 1,
				episodeCount: 12,
				status: "not-requested",
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
