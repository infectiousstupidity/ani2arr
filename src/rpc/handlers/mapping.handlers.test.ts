/** Tests for mapping RPC handler filtering. */
// src/rpc/handlers/mapping.handlers.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import {
	parseTmdbId,
	parseTvdbId,
	type RadarrMovieId,
	type SonarrSeriesId,
} from "@/providers/schemas";
import type { RadarrMovieSnapshot } from "@/providers/radarr/types";
import type { SonarrSeriesSnapshot } from "@/providers/sonarr/types";
import type { MappingList } from "@/mapping/list-mappings";
import {
	mappingService,
	radarrLibrary,
	sonarrLibrary,
} from "@/background/api-services";
import { mappingHandlers } from "./mapping.handlers";

const getMappingListMock = vi.hoisted(() => vi.fn());
const getProviderConfigMock = vi.hoisted(() => vi.fn());
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
	getProviderConfig: getProviderConfigMock,
}));

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;
const anilistSource = (anilistId: ReturnType<typeof aid>) =>
	({ source: "anilist", id: anilistId }) as const;
const credentials = { url: "http://localhost", apiKey: "api-key" };

function sonarrSeries(
	tvdbId: ReturnType<typeof tvdb>,
): SonarrSeriesSnapshot {
	return {
		id: Number(tvdbId) as SonarrSeriesId,
		tvdbId,
		title: `Sonarr ${tvdbId}`,
		titleSlug: `sonarr-${tvdbId}`,
		status: "continuing",
	};
}

function radarrMovie(
	tmdbId: ReturnType<typeof tmdb>,
): RadarrMovieSnapshot {
	return {
		id: Number(tmdbId) as RadarrMovieId,
		tmdbId,
		title: `Radarr ${tmdbId}`,
		titleSlug: `radarr-${tmdbId}`,
		status: "released",
	};
}

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
		getProviderConfigMock.mockResolvedValue(null);
		vi.mocked(sonarrLibrary.getSeriesSnapshots).mockResolvedValue([]);
		vi.mocked(radarrLibrary.getMovieSnapshots).mockResolvedValue([]);
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

	it("builds Sonarr route metadata", async () => {
		getProviderConfigMock.mockResolvedValue(credentials);
		vi.mocked(sonarrLibrary.getSeriesSnapshots).mockResolvedValue([
			sonarrSeries(tvdb(10)),
		]);

		const result = await mappingHandlers.getMappings({ providers: ["sonarr"] });
		const group = result.groups.find((item) => item.providerId === tvdb(10));

		expect(group?.providerMeta).toEqual({
			title: "Sonarr 10",
			type: "series",
			statusLabel: "continuing",
			providerRouteSlug: "sonarr-10",
		});
		expect(group?.rows[0]?.providerMeta).toEqual(group?.providerMeta);
	});

	it("builds Radarr route metadata", async () => {
		const providerId = tmdb(30);
		const mappings: MappingList = {
			provider: "radarr",
			mapped: [
				{
					providerId,
					entries: [
						{
							source: anilistSource(aid(30)),
							anilistId: aid(30),
							result: { kind: "mapped", source: "auto", providerId },
						},
					],
				},
			],
			ignored: [],
			ambiguous: [],
			unmapped: [],
		};
		getMappingListMock.mockResolvedValue(mappings);
		getProviderConfigMock.mockResolvedValue(credentials);
		vi.mocked(radarrLibrary.getMovieSnapshots).mockResolvedValue([
			radarrMovie(providerId),
		]);

		const result = await mappingHandlers.getMappings({ providers: ["radarr"] });

		expect(result.groups[0]?.providerMeta).toEqual({
			title: "Radarr 30",
			type: "movie",
			statusLabel: "released",
			providerRouteSlug: "radarr-30",
		});
		expect(result.groups[0]?.rows[0]?.providerMeta).toEqual(
			result.groups[0]?.providerMeta,
		);
	});

	it("uses the only existing ambiguous target", async () => {
		const existingProviderId = tvdb(40);
		const mappings: MappingList = {
			provider: "sonarr",
			mapped: [],
			ignored: [],
			ambiguous: [
				{
					source: anilistSource(aid(40)),
					anilistId: aid(40),
					result: {
						kind: "ambiguous",
						targets: [
							{ provider: "sonarr", providerId: existingProviderId },
							{ provider: "sonarr", providerId: tvdb(41) },
						],
					},
				},
			],
			unmapped: [],
		};
		getMappingListMock.mockResolvedValue(mappings);
		getProviderConfigMock.mockResolvedValue(credentials);
		vi.mocked(sonarrLibrary.getSeriesSnapshots).mockResolvedValue([
			sonarrSeries(existingProviderId),
		]);

		const result = await mappingHandlers.getMappings({ providers: ["sonarr"] });

		expect(result.groups[0]).toMatchObject({
			providerId: existingProviderId,
			isInLibrary: true,
			providerMeta: { title: "Sonarr 40" },
			rows: [
				{
					providerId: existingProviderId,
					isInLibrary: true,
					mappingRowStatus: "in-library",
				},
			],
		});
	});

	it("keeps groups without an active provider target", async () => {
		const mappings: MappingList = {
			provider: "sonarr",
			mapped: [],
			ambiguous: [
				{
					source: anilistSource(aid(50)),
					anilistId: aid(50),
					result: {
						kind: "ambiguous",
						targets: [{ provider: "sonarr", providerId: tvdb(50) }],
					},
				},
			],
			ignored: [
				{
					source: anilistSource(aid(51)),
					anilistId: aid(51),
					result: { kind: "ignored" },
				},
			],
			unmapped: [
				{
					source: anilistSource(aid(52)),
					anilistId: aid(52),
					result: { kind: "unmapped", hadResolveAttempt: false },
				},
			],
		};
		getMappingListMock.mockResolvedValue(mappings);

		const result = await mappingHandlers.getMappings({ providers: ["sonarr"] });

		expect(result.groups).toHaveLength(3);
		expect(result.groups).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					providerId: null,
					rows: [
						expect.objectContaining({
							anilistId: aid(50),
							providerId: null,
							mappingRowStatus: "needs-review",
						}),
					],
				}),
				expect.objectContaining({
					providerId: null,
					rows: [expect.objectContaining({ anilistId: aid(51) })],
				}),
				expect.objectContaining({
					providerId: null,
					rows: [expect.objectContaining({ anilistId: aid(52) })],
				}),
			]),
		);
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
