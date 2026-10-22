import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import { seerrHandlers } from "./seerr.handlers";

const apiServicesMock = vi.hoisted(() => ({
	anilistMetadataStore: {
		getMetadata: vi.fn(),
	},
	resolveSeerrAutomaticTarget: vi.fn(),
	mappingService: {
		getSeerrTarget: vi.fn(),
		listAllSeerrTargets: vi.fn(),
		listSeerrTargets: vi.fn(),
	},
	seerrClient: {},
}));

const manualStoreMock = vi.hoisted(() => ({
	clearManualSeerrTarget: vi.fn(),
	setManualSeerrTarget: vi.fn(),
}));

const bumpMappingsRevisionMock = vi.hoisted(() => vi.fn());

vi.mock("@/background/api-services", () => apiServicesMock);

vi.mock("@/background/provider-config", () => ({
	requireSeerrConnection: vi.fn(),
}));

vi.mock("@/mapping/manual.store", () => manualStoreMock);

vi.mock("@/rpc/revision-signals", () => ({
	bumpMappingsRevision: bumpMappingsRevisionMock,
}));

const aid = parseAniListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

describe("seerrHandlers", () => {
	beforeEach(() => {
		vi.resetAllMocks();

		manualStoreMock.setManualSeerrTarget.mockImplementation(
			async () => {},
		);
		bumpMappingsRevisionMock.mockImplementation(async () => {});
	});

	it("reads the stored effective target when no resolution hints are supplied", async () => {
		const anilistId = aid(100);
		const target = {
			anilistId,
			mediaType: "movie" as const,
			tmdbId: tmdb(123),
			source: "manual" as const,
		};
		apiServicesMock.mappingService.getSeerrTarget.mockResolvedValue(target);

		await expect(
			seerrHandlers.getSeerrTarget({ anilistId, mediaType: "movie" }),
		).resolves.toBe(target);

		expect(apiServicesMock.mappingService.getSeerrTarget).toHaveBeenCalledWith(
			{
				source: "anilist",
				id: anilistId,
			},
			"movie",
		);
		expect(apiServicesMock.resolveSeerrAutomaticTarget).not.toHaveBeenCalled();
	});

	it("runs automatic resolution when mapping hints are supplied", async () => {
		const anilistId = aid(100);
		const target = {
			anilistId,
			mediaType: "movie" as const,
			tmdbId: tmdb(123),
			source: "automatic" as const,
		};
		apiServicesMock.resolveSeerrAutomaticTarget.mockResolvedValue(target);

		await expect(
			seerrHandlers.getSeerrTarget({
				anilistId,
				mediaType: "movie",
				title: "Perfect Blue",
				metadata: {
					format: "MOVIE",
					startYear: 1998,
				},
				forceRetry: true,
			}),
		).resolves.toBe(target);

		expect(apiServicesMock.resolveSeerrAutomaticTarget).toHaveBeenCalledWith({
			source: {
				source: "anilist",
				id: anilistId,
			},
			anilistId,
			mediaType: "movie",
			title: "Perfect Blue",
			metadata: {
				format: "MOVIE",
				startYear: 1998,
			},
			forceRetry: true,
		});
		expect(apiServicesMock.mappingService.getSeerrTarget).not.toHaveBeenCalled();
	});

	it("stores a complete manual TV target and bumps the mapping revision", async () => {
		const input = {
			anilistId: aid(100),
			mediaType: "tv" as const,
			tmdbId: tmdb(123),
			tvdbId: tvdb(456),
			seasons: [2],
		};

		await expect(seerrHandlers.setManualSeerrTarget(input)).resolves.toEqual({
			ok: true,
		});

		expect(manualStoreMock.setManualSeerrTarget).toHaveBeenCalledWith(
			{
				source: "anilist",
				id: input.anilistId,
			},
			{
				mediaType: "tv",
				tmdbId: input.tmdbId,
				tvdbId: input.tvdbId,
				seasons: input.seasons,
			},
			input.anilistId,
		);
		expect(bumpMappingsRevisionMock).toHaveBeenCalledOnce();
	});

	it("returns AniList entries sharing the same effective Seerr target", async () => {
		apiServicesMock.mappingService.listAllSeerrTargets.mockResolvedValue([
			{
				anilistId: aid(100),
				mediaType: "movie",
				tmdbId: tmdb(123),
				source: "manual",
			},
			{
				anilistId: aid(200),
				mediaType: "movie",
				tmdbId: tmdb(123),
				source: "anibridge",
			},
			{
				anilistId: aid(300),
				mediaType: "movie",
				tmdbId: tmdb(999),
				source: "anibridge",
			},
		]);
		apiServicesMock.anilistMetadataStore.getMetadata.mockResolvedValue({
			metadata: [
				{
					id: aid(100),
					titles: {
						romaji: "Perfect Blue",
					},
					format: "MOVIE",
					seasonYear: 1998,
					coverImage: {
						medium: null,
						large: "https://img.example/perfect-blue.jpg",
					},
				},
			],
		});

		await expect(
			seerrHandlers.getSeerrLinkedAniListEntries({
				mediaType: "movie",
				tmdbId: tmdb(123),
			}),
		).resolves.toEqual([
			{
				anilistId: aid(100),
				title: "Perfect Blue",
				format: "MOVIE",
				year: 1998,
				coverImage: "https://img.example/perfect-blue.jpg",
			},
			{
				anilistId: aid(200),
			},
		]);
	});
});
