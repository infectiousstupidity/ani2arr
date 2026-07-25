/** Tests for Seerr RPC request, target, search, and status handlers. */
// src/rpc/handlers/seerr.handlers.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
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
const getEffectiveSeerrTargetMock = vi.hoisted(() => vi.fn());
const listEffectiveSeerrTargetsMock = vi.hoisted(() => vi.fn());
const listAllEffectiveSeerrTargetsMock = vi.hoisted(() => vi.fn());
const setManualSeerrTargetMock = vi.hoisted(() => vi.fn());
const clearManualSeerrTargetMock = vi.hoisted(() => vi.fn());
const bumpMappingsRevisionMock = vi.hoisted(() => vi.fn());

vi.mock("@/background/api-services", () => ({
	seerrClient: seerrClientMock,
	anilistMetadataStore: anilistMetadataStoreMock,
}));

vi.mock("@/background/provider-config", () => ({
	requireSeerrConnection: requireSeerrConnectionMock,
}));

vi.mock("@/mapping/seerr-target.store", () => ({
	getEffectiveSeerrTarget: getEffectiveSeerrTargetMock,
	listEffectiveSeerrTargets: listEffectiveSeerrTargetsMock,
	listAllEffectiveSeerrTargets: listAllEffectiveSeerrTargetsMock,
	setManualSeerrTarget: setManualSeerrTargetMock,
	clearManualSeerrTarget: clearManualSeerrTargetMock,
}));

vi.mock("@/rpc/revision-signals", () => ({
	bumpMappingsRevision: bumpMappingsRevisionMock,
}));

describe("seerrHandlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		requireSeerrConnectionMock.mockResolvedValue(connection);
		getEffectiveSeerrTargetMock.mockResolvedValue(null);
		listEffectiveSeerrTargetsMock.mockResolvedValue([]);
		listAllEffectiveSeerrTargetsMock.mockResolvedValue([]);
		setManualSeerrTargetMock.mockResolvedValue(null);
		clearManualSeerrTargetMock.mockResolvedValue(null);
		anilistMetadataStoreMock.getMetadata.mockResolvedValue({ metadata: [] });
	});

	it("creates Seerr requests from minimal RPC input", async () => {
		seerrClientMock.requestMedia.mockResolvedValue({ id: 1, status: 1 });

		await expect(
			seerrHandlers.requestInSeerr({
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

	it("delegates batch Seerr target reads to mapping", async () => {
		listEffectiveSeerrTargetsMock.mockResolvedValue([
			{
				anilistId: parseAniListId(100),
				mediaType: "tv",
				tmdbId: parseTmdbId(456),
				seasons: [0, 1, 2],
				tmdbSeasons: [0, 2],
				tvdbSeasons: [0, 1],
				tvdbId: parseTvdbId(789),
				source: "anibridge",
			},
		]);
		const ids = [parseAniListId(100)];

		await expect(seerrHandlers.getSeerrTargets(ids)).resolves.toEqual([
			{
				anilistId: parseAniListId(100),
				mediaType: "tv",
				tmdbId: parseTmdbId(456),
				seasons: [0, 1, 2],
				tmdbSeasons: [0, 2],
				tvdbSeasons: [0, 1],
				tvdbId: parseTvdbId(789),
				source: "anibridge",
			},
		]);
		expect(listEffectiveSeerrTargetsMock).toHaveBeenCalledWith(ids);
	});

	it("delegates one Seerr target read to mapping", async () => {
		getEffectiveSeerrTargetMock.mockResolvedValue({
			anilistId: parseAniListId(100),
			mediaType: "movie",
			tmdbId: parseTmdbId(123),
			source: "manual",
		});

		await expect(
			seerrHandlers.getSeerrTarget({ anilistId: parseAniListId(100) }),
		).resolves.toEqual({
			anilistId: parseAniListId(100),
			mediaType: "movie",
			tmdbId: parseTmdbId(123),
			source: "manual",
		});
		expect(getEffectiveSeerrTargetMock).toHaveBeenCalledWith(
			{
				identity: { source: "anilist", id: parseAniListId(100) },
				anilistId: parseAniListId(100),
			},
		);
	});

	it("clears manual Seerr targets", async () => {
		await expect(
			seerrHandlers.clearManualSeerrTarget({ anilistId: parseAniListId(100) }),
		).resolves.toEqual({ ok: true });
		expect(clearManualSeerrTargetMock).toHaveBeenCalledWith(
			{
				identity: { source: "anilist", id: parseAniListId(100) },
				anilistId: parseAniListId(100),
			},
		);
		expect(bumpMappingsRevisionMock).toHaveBeenCalledOnce();
	});

	it("returns null when no manual or upstream Seerr target exists", async () => {
		await expect(
			seerrHandlers.getSeerrTarget({ anilistId: parseAniListId(100) }),
		).resolves.toBeNull();
		expect(getEffectiveSeerrTargetMock).toHaveBeenCalledWith(
			{
				identity: { source: "anilist", id: parseAniListId(100) },
				anilistId: parseAniListId(100),
			},
		);
	});

	it("returns already-effective targets from bulk lookup", async () => {
		listEffectiveSeerrTargetsMock.mockResolvedValue([
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
		const ids = [parseAniListId(100), parseAniListId(200)];

		await expect(seerrHandlers.getSeerrTargets(ids)).resolves.toEqual([
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
		expect(listEffectiveSeerrTargetsMock).toHaveBeenCalledWith(ids);
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
		expect(setManualSeerrTargetMock).toHaveBeenCalledWith({
			...input,
			identity: { source: "anilist", id: input.anilistId },
		});
		expect(bumpMappingsRevisionMock).toHaveBeenCalledOnce();
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
		listAllEffectiveSeerrTargetsMock.mockResolvedValue([
			{
				anilistId: parseAniListId(100),
				mediaType: "movie",
				tmdbId: parseTmdbId(123),
				source: "manual",
			},
			{
				anilistId: parseAniListId(200),
				mediaType: "movie",
				tmdbId: parseTmdbId(123),
				source: "anibridge",
			},
			{
				anilistId: parseAniListId(300),
				mediaType: "movie",
				tmdbId: parseTmdbId(999),
				source: "anibridge",
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
		expect(listAllEffectiveSeerrTargetsMock).toHaveBeenCalledOnce();
	});
});
