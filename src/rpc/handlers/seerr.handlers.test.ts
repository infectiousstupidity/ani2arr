import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
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
const getUniqueAniListIdForSourceMock = vi.hoisted(() => vi.fn());

vi.mock("@/background/api-services", () => apiServicesMock);

vi.mock("@/background/provider-config", () => ({
	requireSeerrConnection: vi.fn(),
}));

vi.mock("@/mapping/manual.store", () => manualStoreMock);

vi.mock("@/mapping/upstream.store", () => ({
	getUniqueAniListIdForSource: getUniqueAniListIdForSourceMock,
}));

vi.mock("@/rpc/revision-signals", () => ({
	bumpMappingsRevision: bumpMappingsRevisionMock,
}));

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

describe("seerrHandlers", () => {
	beforeEach(() => {
		vi.resetAllMocks();

		getUniqueAniListIdForSourceMock.mockResolvedValue(null);
		manualStoreMock.clearManualSeerrTarget.mockImplementation(async () => {});
		manualStoreMock.setManualSeerrTarget.mockImplementation(async () => {});
		bumpMappingsRevisionMock.mockImplementation(async () => {});
	});

	it.each([
		{ name: "linked", linkedAniListId: aid(100) },
		{ name: "unlinked", linkedAniListId: null },
	])(
		"reads a $name MAL target with one link lookup",
		async ({ linkedAniListId }) => {
			const source = { source: "mal", id: mal(5114) } as const;
			const target = {
				...(linkedAniListId === null ? {} : { anilistId: linkedAniListId }),
				mediaType: "movie" as const,
				tmdbId: tmdb(123),
				source: "manual" as const,
			};
			getUniqueAniListIdForSourceMock.mockResolvedValue(linkedAniListId);
			apiServicesMock.mappingService.getSeerrTarget.mockResolvedValue(target);

			await expect(
				seerrHandlers.getSeerrTarget({ source, mediaType: "movie" }),
			).resolves.toBe(target);

			expect(getUniqueAniListIdForSourceMock).toHaveBeenCalledOnce();
			expect(getUniqueAniListIdForSourceMock).toHaveBeenCalledWith(source);
			expect(
				apiServicesMock.mappingService.getSeerrTarget,
			).toHaveBeenCalledWith(source, "movie", linkedAniListId);
		},
	);

	it.each([
		{ name: "linked", linkedAniListId: aid(100) },
		{ name: "unlinked", linkedAniListId: null },
	])(
		"resolves a $name MAL target with the original source",
		async ({ linkedAniListId }) => {
			const source = { source: "mal", id: mal(5114) } as const;
			getUniqueAniListIdForSourceMock.mockResolvedValue(linkedAniListId);
			apiServicesMock.resolveSeerrAutomaticTarget.mockResolvedValue(null);

			await seerrHandlers.getSeerrTarget({
				source,
				mediaType: "movie",
				title: "Perfect Blue",
				forceRetry: true,
			});

			expect(getUniqueAniListIdForSourceMock).toHaveBeenCalledOnce();
			expect(apiServicesMock.resolveSeerrAutomaticTarget).toHaveBeenCalledWith({
				source,
				anilistId: linkedAniListId,
				mediaType: "movie",
				title: "Perfect Blue",
				forceRetry: true,
			});
		},
	);

	it.each([
		{ name: "linked", linkedAniListId: aid(100) },
		{ name: "unlinked", linkedAniListId: null },
	])(
		"stores a complete manual TV target for a $name MAL source",
		async ({ linkedAniListId }) => {
			const input = {
				source: { source: "mal", id: mal(5114) } as const,
				mediaType: "tv" as const,
				tmdbId: tmdb(123),
				tvdbId: tvdb(456),
				seasons: [2],
			};
			getUniqueAniListIdForSourceMock.mockResolvedValue(linkedAniListId);

			await expect(seerrHandlers.setManualSeerrTarget(input)).resolves.toEqual({
				ok: true,
			});

			expect(getUniqueAniListIdForSourceMock).toHaveBeenCalledOnce();
			expect(manualStoreMock.setManualSeerrTarget).toHaveBeenCalledWith(
				input.source,
				{
					mediaType: "tv",
					tmdbId: input.tmdbId,
					tvdbId: input.tvdbId,
					seasons: input.seasons,
				},
				linkedAniListId ?? undefined,
			);
			expect(bumpMappingsRevisionMock).toHaveBeenCalledOnce();
		},
	);

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
