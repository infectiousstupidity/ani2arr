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
const resolveSeerrAutomaticTargetMock = vi.hoisted(() => vi.fn());
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
	resolveSeerrAutomaticTarget: resolveSeerrAutomaticTargetMock,
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
		requireSeerrConnectionMock.mockResolvedValue(connection);
	});

	it("creates Seerr requests from minimal RPC input", async () => {
		const result = { id: 1, status: 1 };
		seerrClientMock.requestMedia.mockResolvedValue(result);

		await expect(
			seerrHandlers.requestInSeerr({
				mediaType: "movie",
				tmdbId: parseTmdbId(123),
			}),
		).resolves.toBe(result);

		expect(seerrClientMock.requestMedia).toHaveBeenCalledWith(
			{ mediaType: "movie", mediaId: parseTmdbId(123) },
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
		const ids = [parseAniListId(100)];
		const targets = [
			{
				anilistId: ids[0],
				mediaType: "movie" as const,
				tmdbId: parseTmdbId(456),
				source: "manual" as const,
			},
		];
		listEffectiveSeerrTargetsMock.mockResolvedValue(targets);

		await expect(seerrHandlers.getSeerrTargets(ids)).resolves.toBe(targets);
		expect(listEffectiveSeerrTargetsMock).toHaveBeenCalledWith(ids);
	});

	it("delegates one Seerr target read to mapping", async () => {
		const target = {
			anilistId: parseAniListId(100),
			mediaType: "movie" as const,
			tmdbId: parseTmdbId(123),
			source: "manual" as const,
		};
		getEffectiveSeerrTargetMock.mockResolvedValue(target);

		await expect(
			seerrHandlers.getSeerrTarget({ anilistId: parseAniListId(100) }),
		).resolves.toBe(target);
		expect(getEffectiveSeerrTargetMock).toHaveBeenCalledWith({
			identity: { source: "anilist", id: parseAniListId(100) },
			anilistId: parseAniListId(100),
		});
	});

	it("clears manual Seerr targets", async () => {
		await expect(
			seerrHandlers.clearManualSeerrTarget({ anilistId: parseAniListId(100) }),
		).resolves.toEqual({ ok: true });
		expect(clearManualSeerrTargetMock).toHaveBeenCalledWith({
			identity: { source: "anilist", id: parseAniListId(100) },
			anilistId: parseAniListId(100),
		});
		expect(bumpMappingsRevisionMock).toHaveBeenCalledOnce();
	});

	it("resolves a missing target when source metadata is provided", async () => {
		const anilistId = parseAniListId(100);
		const target = {
			anilistId,
			mediaType: "movie" as const,
			tmdbId: parseTmdbId(123),
			source: "automatic" as const,
		};
		resolveSeerrAutomaticTargetMock.mockResolvedValue(target);

		await expect(
			seerrHandlers.getSeerrTarget({
				anilistId,
				title: "Perfect Blue",
				metadata: { format: "MOVIE", startYear: 1998 },
			}),
		).resolves.toBe(target);
		expect(resolveSeerrAutomaticTargetMock).toHaveBeenCalledWith({
			source: { source: "anilist", id: anilistId },
			anilistId,
			title: "Perfect Blue",
			metadata: { format: "MOVIE", startYear: 1998 },
		});
		expect(getEffectiveSeerrTargetMock).not.toHaveBeenCalled();
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
		const results = [
			{ mediaType: "movie", tmdbId: parseTmdbId(123), title: "Movie" },
		];
		seerrClientMock.searchMedia.mockResolvedValue(results);

		await expect(
			seerrHandlers.searchSeerrMedia({ query: "movie" }),
		).resolves.toBe(results);
		expect(seerrClientMock.searchMedia).toHaveBeenCalledWith(
			"movie",
			connection,
		);
	});

	it("reads Seerr details through configured credentials", async () => {
		const details = {
			mediaType: "movie",
			tmdbId: parseTmdbId(123),
			title: "Movie",
			status: "unknown",
		} as const;
		seerrClientMock.getMediaDetails.mockResolvedValue(details);

		await expect(
			seerrHandlers.getSeerrMediaDetails({
				mediaType: "movie",
				tmdbId: parseTmdbId(123),
			}),
		).resolves.toBe(details);
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
