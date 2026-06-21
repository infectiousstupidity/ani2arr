/** Tests for mapping RPC handler filtering. */
// src/rpc/handlers/mapping.handlers.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTvdbId } from "@/providers/schemas";
import type { MappingList } from "@/mapping/list-mappings";
import { mappingService } from "@/background/api-services";
import { mappingHandlers } from "./mapping.handlers";

const getMappingListMock = vi.hoisted(() => vi.fn());
const refreshUpstreamMappingsMock = vi.hoisted(() => vi.fn());

vi.mock("@/mapping/list-mappings", () => ({
	getMappingIdentities: vi.fn(),
	getMappingList: getMappingListMock,
}));

vi.mock("@/mapping/upstream.store", () => ({
	getUniqueAniListIdForSource: vi.fn(),
	refreshUpstreamMappings: refreshUpstreamMappingsMock,
}));

vi.mock("@/background/api-services", () => ({
	anilistMetadataStore: {
		getMetadata: vi.fn(),
	},
	bumpLibraryRevision: vi.fn(),
	bumpMappingsRevision: vi.fn(),
	mappingService: {
		clearIgnored: vi.fn(),
		clearManualMapping: vi.fn(),
		clearRejectedCandidate: vi.fn(),
		getLinkedAniListIds: vi.fn(),
		rejectCandidate: vi.fn(),
		resolveMapping: vi.fn(),
		setIgnored: vi.fn(),
		setManualMapping: vi.fn(),
	},
	radarrLibrary: {
		getMovieSnapshots: vi.fn(async () => []),
	},
	scheduleLibraryRefresh: vi.fn(),
	sonarrLibrary: {
		getSeriesSnapshots: vi.fn(async () => []),
	},
}));

vi.mock("@/background/provider-config", () => ({
	getProviderConfig: vi.fn(async () => null),
}));

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tvdb = parseTvdbId;
const anilistSource = (anilistId: ReturnType<typeof aid>) =>
	({ source: "anilist", id: anilistId }) as const;

const sonarrMappings: MappingList = {
	provider: "sonarr",
	mapped: [
		{
			providerId: tvdb(10),
			entries: [
				{
					source: anilistSource(aid(1)),
					anilistId: aid(1),
					result: { kind: "mapped", source: "manual", providerId: tvdb(10) },
				},
				{
					source: anilistSource(aid(2)),
					anilistId: aid(2),
					result: { kind: "mapped", source: "auto", providerId: tvdb(10) },
				},
			],
		},
		{
			providerId: tvdb(20),
			entries: [
				{
					source: anilistSource(aid(3)),
					anilistId: aid(3),
					result: { kind: "mapped", source: "auto", providerId: tvdb(20) },
				},
			],
		},
	],
	ignored: [],
	ambiguous: [],
	unmapped: [],
};

describe("mappingHandlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getMappingListMock.mockResolvedValue(sonarrMappings);
	});

	it("filters mapped groups by active source before applying limit", async () => {
		const result = await mappingHandlers.getMappings({
			providers: ["sonarr"],
			source: "auto",
			limit: 1,
		});

		expect(result.total).toBe(2);
		expect(result.groups).toHaveLength(1);
		expect(result.groups[0]?.providerId).toBe(tvdb(10));
		expect(result.groups[0]?.rows).toEqual([
			expect.objectContaining({
				anilistId: aid(2),
				result: expect.objectContaining({ source: "auto" }),
			}),
		]);
		expect(result.groups[0]?.linkedAniListIds).toEqual([aid(2)]);
	});

	it("does not flag a MAL manual mapping as conflicting with its current AniList crosswalk", async () => {
		vi.mocked(mappingService.getLinkedAniListIds).mockResolvedValueOnce([
			aid(10),
		]);

		await expect(
			mappingHandlers.setManualMapping({
				provider: "sonarr",
				providerId: tvdb(20),
				source: { source: "mal", id: mal(5114) },
				anilistId: aid(10),
			}),
		).resolves.toEqual({ ok: true });

		expect(mappingService.setManualMapping).toHaveBeenCalledWith(
			"sonarr",
			{ source: "mal", id: mal(5114) },
			tvdb(20),
		);
	});

	it("exposes a narrow upstream refresh handler", async () => {
		refreshUpstreamMappingsMock.mockImplementationOnce(async () => {});

		await expect(mappingHandlers.refreshUpstreamMappings()).resolves.toBeUndefined();

		expect(refreshUpstreamMappingsMock).toHaveBeenCalledTimes(1);
	});
});
