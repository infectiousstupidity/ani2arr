/** Tests for Seerr RPC request, target, search, and status handlers. */
// src/rpc/handlers/seerr.handlers.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseTmdbId } from "@/providers/schemas";
import type { SeerrConnection } from "@/providers/seerr/types";
import { seerrHandlers } from "./seerr.handlers";

const connection: SeerrConnection = {
	url: "https://seerr.example",
	auth: { mode: "session" },
	account: { id: 1, displayName: "Alice" },
};

const seerrClientMock = vi.hoisted(() => ({
	requestMedia: vi.fn(),
	getMediaStatus: vi.fn(),
	getMediaDetails: vi.fn(),
	searchMedia: vi.fn(),
}));
const anilistMetadataStoreMock = vi.hoisted(() => ({
	getMetadata: vi.fn(),
}));
const requireSeerrConnectionMock = vi.hoisted(() => vi.fn());
const listSeerrUpstreamTargetsMock = vi.hoisted(() => vi.fn());
const listAllSeerrUpstreamTargetsMock = vi.hoisted(() => vi.fn());
const getManualSeerrTargetMock = vi.hoisted(() => vi.fn());
const listManualSeerrTargetsMock = vi.hoisted(() => vi.fn());
const listAllManualSeerrTargetsMock = vi.hoisted(() => vi.fn());
const setManualSeerrTargetMock = vi.hoisted(() => vi.fn());
const clearManualSeerrTargetMock = vi.hoisted(() => vi.fn());

vi.mock("@/background/api-services", () => ({
	seerrClient: seerrClientMock,
	anilistMetadataStore: anilistMetadataStoreMock,
}));

vi.mock("@/background/provider-config", () => ({
	requireSeerrConnection: requireSeerrConnectionMock,
}));

vi.mock("@/mapping/upstream.store", () => ({
	listSeerrUpstreamTargets: listSeerrUpstreamTargetsMock,
	listAllSeerrUpstreamTargets: listAllSeerrUpstreamTargetsMock,
}));

vi.mock("@/mapping/seerr-target.store", () => ({
	getManualSeerrTarget: getManualSeerrTargetMock,
	listManualSeerrTargets: listManualSeerrTargetsMock,
	listAllManualSeerrTargets: listAllManualSeerrTargetsMock,
	setManualSeerrTarget: setManualSeerrTargetMock,
	clearManualSeerrTarget: clearManualSeerrTargetMock,
}));

describe("seerrHandlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		requireSeerrConnectionMock.mockResolvedValue(connection);
		getManualSeerrTargetMock.mockResolvedValue(null);
		listManualSeerrTargetsMock.mockResolvedValue([]);
		listAllManualSeerrTargetsMock.mockResolvedValue([]);
		listSeerrUpstreamTargetsMock.mockResolvedValue([]);
		listAllSeerrUpstreamTargetsMock.mockResolvedValue([]);
		setManualSeerrTargetMock.mockResolvedValue(null);
		clearManualSeerrTargetMock.mockResolvedValue(null);
		anilistMetadataStoreMock.getMetadata.mockResolvedValue({ metadata: [] });
	});

	it("creates Seerr requests from minimal RPC input", async () => {
		seerrClientMock.requestMedia.mockResolvedValue({ id: 1, status: 1 });

		await expect(
			seerrHandlers.requestInSeerr({
				anilistId: parseAniListId(100),
				mediaType: "movie",
				tmdbId: parseTmdbId(123),
			}),
		).resolves.toEqual({ id: 1, status: 1 });

		expect(seerrClientMock.requestMedia).toHaveBeenCalledWith(
			{ mediaType: "movie", mediaId: parseTmdbId(123) },
			connection,
		);
	});

	it("reads Seerr movie status through TMDB ID", async () => {
		seerrClientMock.getMediaStatus.mockResolvedValue("available");

		await expect(
			seerrHandlers.getSeerrMediaStatus({
				mediaType: "movie",
				tmdbId: parseTmdbId(123),
			}),
		).resolves.toEqual({ status: "available" });

		expect(seerrClientMock.getMediaStatus).toHaveBeenCalledWith(
			{
				mediaType: "movie",
				tmdbId: parseTmdbId(123),
			},
			connection,
		);
	});

	it("reads Seerr TV status without Sonarr or Radarr config", async () => {
		seerrClientMock.getMediaStatus.mockResolvedValue("pending");

		await expect(
			seerrHandlers.getSeerrMediaStatus({
				mediaType: "tv",
				tmdbId: parseTmdbId(456),
				seasons: [1, 2],
			}),
		).resolves.toEqual({ status: "pending" });

		expect(seerrClientMock.getMediaStatus).toHaveBeenCalledWith(
			{
				mediaType: "tv",
				tmdbId: parseTmdbId(456),
				seasons: [1, 2],
			},
			connection,
		);
	});

	it("returns Seerr request targets from upstream mappings", async () => {
		listSeerrUpstreamTargetsMock.mockResolvedValue([
			{
				anilistId: parseAniListId(100),
				target: {
					mediaType: "tv",
					tmdbId: parseTmdbId(456),
					seasons: [1, 2],
				},
			},
		]);

		await expect(
			seerrHandlers.getSeerrTargets([parseAniListId(100)]),
		).resolves.toEqual([
			{
				anilistId: parseAniListId(100),
				mediaType: "tv",
				tmdbId: parseTmdbId(456),
				seasons: [1, 2],
				source: "anibridge",
			},
		]);
	});

	it("uses manual Seerr target before AniBridge target", async () => {
		getManualSeerrTargetMock.mockResolvedValue({
			anilistId: parseAniListId(100),
			mediaType: "movie",
			tmdbId: parseTmdbId(123),
		});

		await expect(
			seerrHandlers.getSeerrTarget(parseAniListId(100)),
		).resolves.toEqual({
			anilistId: parseAniListId(100),
			mediaType: "movie",
			tmdbId: parseTmdbId(123),
			source: "manual",
		});
		expect(listSeerrUpstreamTargetsMock).not.toHaveBeenCalled();
	});

	it("clearing manual target restores AniBridge fallback", async () => {
		listSeerrUpstreamTargetsMock.mockResolvedValue([
			{
				anilistId: parseAniListId(100),
				target: {
					mediaType: "movie",
					tmdbId: parseTmdbId(456),
				},
			},
		]);

		await expect(
			seerrHandlers.clearManualSeerrTarget(parseAniListId(100)),
		).resolves.toEqual({ ok: true });
		await expect(
			seerrHandlers.getSeerrTarget(parseAniListId(100)),
		).resolves.toEqual({
			anilistId: parseAniListId(100),
			mediaType: "movie",
			tmdbId: parseTmdbId(456),
			source: "anibridge",
		});
	});

	it("returns null when no manual or upstream Seerr target exists", async () => {
		await expect(
			seerrHandlers.getSeerrTarget(parseAniListId(100)),
		).resolves.toBeNull();
	});

	it("uses manual targets in bulk target lookup", async () => {
		listManualSeerrTargetsMock.mockResolvedValue([
			{
				anilistId: parseAniListId(100),
				mediaType: "movie",
				tmdbId: parseTmdbId(123),
			},
		]);
		listSeerrUpstreamTargetsMock.mockResolvedValue([
			{
				anilistId: parseAniListId(100),
				target: {
					mediaType: "movie",
					tmdbId: parseTmdbId(456),
				},
			},
			{
				anilistId: parseAniListId(200),
				target: {
					mediaType: "movie",
					tmdbId: parseTmdbId(789),
				},
			},
		]);

		await expect(
			seerrHandlers.getSeerrTargets([parseAniListId(100), parseAniListId(200)]),
		).resolves.toEqual([
			{
				anilistId: parseAniListId(100),
				mediaType: "movie",
				tmdbId: parseTmdbId(123),
				source: "manual",
			},
			{
				anilistId: parseAniListId(200),
				mediaType: "movie",
				tmdbId: parseTmdbId(789),
				source: "anibridge",
			},
		]);
	});

	it("saves manual Seerr targets", async () => {
		const input = {
			anilistId: parseAniListId(100),
			mediaType: "movie" as const,
			tmdbId: parseTmdbId(123),
		};

		await expect(seerrHandlers.setManualSeerrTarget(input)).resolves.toEqual({
			ok: true,
		});
		expect(setManualSeerrTargetMock).toHaveBeenCalledWith(input);
	});

	it("searches Seerr through configured credentials", async () => {
		seerrClientMock.searchMedia.mockResolvedValue([
			{ mediaType: "movie", tmdbId: parseTmdbId(123), title: "Movie" },
		]);

		await expect(
			seerrHandlers.searchSeerrMedia({ query: "movie" }),
		).resolves.toEqual([
			{ mediaType: "movie", tmdbId: parseTmdbId(123), title: "Movie" },
		]);
		expect(seerrClientMock.searchMedia).toHaveBeenCalledWith("movie", connection);
	});

	it("reads Seerr details through configured credentials", async () => {
		seerrClientMock.getMediaDetails.mockResolvedValue({
			mediaType: "movie",
			tmdbId: parseTmdbId(123),
			title: "Movie",
			status: "unknown",
		});

		await expect(
			seerrHandlers.getSeerrMediaDetails({
				mediaType: "movie",
				tmdbId: parseTmdbId(123),
			}),
		).resolves.toEqual({
			mediaType: "movie",
			tmdbId: parseTmdbId(123),
			title: "Movie",
			status: "unknown",
		});
		expect(seerrClientMock.getMediaDetails).toHaveBeenCalledWith(
			{ mediaType: "movie", tmdbId: parseTmdbId(123) },
			connection,
		);
	});

	it("returns AniList entries sharing the same effective Seerr title", async () => {
		listAllManualSeerrTargetsMock.mockResolvedValue([
			{
				anilistId: parseAniListId(100),
				mediaType: "movie",
				tmdbId: parseTmdbId(123),
			},
		]);
		listAllSeerrUpstreamTargetsMock.mockResolvedValue([
			{
				anilistId: parseAniListId(100),
				target: {
					mediaType: "movie",
					tmdbId: parseTmdbId(999),
				},
			},
			{
				anilistId: parseAniListId(200),
				target: {
					mediaType: "movie",
					tmdbId: parseTmdbId(123),
				},
			},
		]);
		anilistMetadataStoreMock.getMetadata.mockResolvedValue({
			metadata: [
				{
					id: parseAniListId(100),
					titles: { romaji: "Current" },
					format: "MOVIE",
					seasonYear: 2024,
				},
				{
					id: parseAniListId(200),
					titles: { romaji: "Linked" },
				},
			],
		});

		await expect(
			seerrHandlers.getSeerrLinkedAniListEntries({
				mediaType: "movie",
				tmdbId: parseTmdbId(123),
			}),
		).resolves.toEqual([
			{
				anilistId: parseAniListId(100),
				title: "Current",
				format: "MOVIE",
				year: 2024,
			},
			{
				anilistId: parseAniListId(200),
				title: "Linked",
			},
		]);
	});
});
