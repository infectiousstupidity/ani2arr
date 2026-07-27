import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import { seerrHandlers } from "./seerr.handlers";

const apiServicesMock = vi.hoisted(() => ({
	anilistMetadataStore: {
		getMetadata: vi.fn(),
	},
	resolveSeerrAutomaticTarget: vi.fn(),
	seerrClient: {},
}));

const seerrTargetStoreMock = vi.hoisted(() => ({
	clearManualSeerrTarget: vi.fn(),
	getEffectiveSeerrTarget: vi.fn(),
	listAllEffectiveSeerrTargets: vi.fn(),
	listEffectiveSeerrTargets: vi.fn(),
	setManualSeerrTarget: vi.fn(),
}));

const bumpMappingsRevisionMock = vi.hoisted(() => vi.fn());

vi.mock("@/background/api-services", () => apiServicesMock);

vi.mock("@/background/provider-config", () => ({
	requireSeerrConnection: vi.fn(),
}));

vi.mock("@/mapping/seerr-target.store", () => seerrTargetStoreMock);

vi.mock("@/rpc/revision-signals", () => ({
	bumpMappingsRevision: bumpMappingsRevisionMock,
}));

const aid = parseAniListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

describe("seerrHandlers", () => {
	beforeEach(() => {
		vi.resetAllMocks();

		seerrTargetStoreMock.setManualSeerrTarget.mockImplementation(
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
		seerrTargetStoreMock.getEffectiveSeerrTarget.mockResolvedValue(target);

		await expect(seerrHandlers.getSeerrTarget({ anilistId })).resolves.toBe(
			target,
		);

		expect(seerrTargetStoreMock.getEffectiveSeerrTarget).toHaveBeenCalledWith({
			identity: {
				source: "anilist",
				id: anilistId,
			},
			anilistId,
		});
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
			title: "Perfect Blue",
			metadata: {
				format: "MOVIE",
				startYear: 1998,
			},
			forceRetry: true,
		});
		expect(seerrTargetStoreMock.getEffectiveSeerrTarget).not.toHaveBeenCalled();
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

		expect(seerrTargetStoreMock.setManualSeerrTarget).toHaveBeenCalledWith({
			...input,
			identity: {
				source: "anilist",
				id: input.anilistId,
			},
		});
		expect(bumpMappingsRevisionMock).toHaveBeenCalledOnce();
	});

	it("returns AniList entries sharing the same effective Seerr target", async () => {
		seerrTargetStoreMock.listAllEffectiveSeerrTargets.mockResolvedValue([
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
