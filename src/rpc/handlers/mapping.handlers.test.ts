import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import {
	mappingService,
	radarrLibrary,
	sonarrLibrary,
} from "@/background/api-services";
import type { EffectiveMappingRecord } from "@/mapping/mapping-facts";
import {
	getSourceAliasesByAniListId,
	getUniqueAniListIdForSource,
} from "@/mapping/upstream.store";
import { parseMyAnimeListId } from "@/myanimelist/types";
import type { RadarrMovieSnapshot } from "@/providers/radarr/types";
import {
	parseTmdbId,
	parseTvdbId,
	type RadarrMovieId,
	type SonarrSeriesId,
} from "@/providers/schemas";
import type { SonarrSeriesSnapshot } from "@/providers/sonarr/types";
import type { Provider } from "@/providers/types";
import { ErrorCode } from "@/shared/errors/error.types";
import { mappingHandlers } from "./mapping.handlers";

const listEffectiveMappingRecordsByProviderMock = vi.hoisted(() => vi.fn());
const getProviderConfigMock = vi.hoisted(() => vi.fn());
const bumpMappingsRevisionMock = vi.hoisted(() => vi.fn());

vi.mock("@/mapping/list-mappings", () => ({
	getMappingIdentities: vi.fn(),
	listEffectiveMappingRecordsByProvider:
		listEffectiveMappingRecordsByProviderMock,
}));

vi.mock("@/mapping/upstream.store", () => ({
	getSourceAliasesByAniListId: vi.fn(),
	getUniqueAniListIdForSource: vi.fn(),
	getUniqueAniListIdsForSources: vi.fn(),
}));

vi.mock("@/background/api-services", () => ({
	anilistMetadataStore: {
		getMetadata: vi.fn(),
	},
	mappingService: {
		getLinkedAniListIds: vi.fn(),
		setIgnored: vi.fn(),
		setManualMapping: vi.fn(),
	},
	radarrLibrary: {
		getMovieSnapshots: vi.fn(),
	},
	sonarrLibrary: {
		getSeriesSnapshots: vi.fn(),
	},
}));

vi.mock("@/background/provider-config", () => ({
	getProviderConfig: getProviderConfigMock,
}));

vi.mock("@/rpc/revision-signals", () => ({
	bumpMappingsRevision: bumpMappingsRevisionMock,
}));

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

const credentials = {
	url: "http://localhost",
	apiKey: "api-key",
};

function mappingRecord(
	anilistId: ReturnType<typeof aid>,
	provider: Provider,
	result: EffectiveMappingRecord["result"],
): EffectiveMappingRecord {
	return { anilistId, provider, result };
}

function sonarrSeries(tvdbId: ReturnType<typeof tvdb>): SonarrSeriesSnapshot {
	return {
		id: Number(tvdbId) as SonarrSeriesId,
		tvdbId,
		title: `Sonarr ${tvdbId}`,
		titleSlug: `sonarr-${tvdbId}`,
		status: "continuing",
	};
}

function radarrMovie(tmdbId: ReturnType<typeof tmdb>): RadarrMovieSnapshot {
	return {
		id: Number(tmdbId) as RadarrMovieId,
		tmdbId,
		title: `Radarr ${tmdbId}`,
		titleSlug: `radarr-${tmdbId}`,
		status: "released",
	};
}

function mockMappingRecords(
	records: Partial<Record<Provider, EffectiveMappingRecord[]>>,
): void {
	listEffectiveMappingRecordsByProviderMock.mockResolvedValue({
		sonarr: records.sonarr ?? [],
		radarr: records.radarr ?? [],
	});
}

describe("mappingHandlers", () => {
	beforeEach(() => {
		vi.resetAllMocks();

		vi.mocked(getSourceAliasesByAniListId).mockResolvedValue(new Map());
		vi.mocked(getUniqueAniListIdForSource).mockResolvedValue(null);
		vi.mocked(mappingService.getLinkedAniListIds).mockResolvedValue([]);
		vi.mocked(sonarrLibrary.getSeriesSnapshots).mockResolvedValue([]);
		vi.mocked(radarrLibrary.getMovieSnapshots).mockResolvedValue([]);
		getProviderConfigMock.mockResolvedValue(null);
		bumpMappingsRevisionMock.mockImplementation(async () => {});
		mockMappingRecords({});
	});

	it("composes grouped mappings with aliases, library state, and provider metadata", async () => {
		const alias = { source: "mal", id: mal(5114) } as const;

		mockMappingRecords({
			sonarr: [
				mappingRecord(aid(1), "sonarr", {
					kind: "mapped",
					source: "manual",
					providerId: tvdb(10),
				}),
				mappingRecord(aid(2), "sonarr", {
					kind: "mapped",
					source: "auto",
					providerId: tvdb(10),
				}),
				mappingRecord(aid(4), "sonarr", {
					kind: "ignored",
				}),
			],
			radarr: [
				mappingRecord(aid(3), "radarr", {
					kind: "mapped",
					source: "auto",
					providerId: tmdb(30),
				}),
			],
		});

		vi.mocked(getSourceAliasesByAniListId).mockResolvedValue(
			new Map([[aid(2), [alias]]]),
		);
		getProviderConfigMock.mockResolvedValue(credentials);
		vi.mocked(sonarrLibrary.getSeriesSnapshots).mockResolvedValue([
			sonarrSeries(tvdb(10)),
		]);
		vi.mocked(radarrLibrary.getMovieSnapshots).mockResolvedValue([
			radarrMovie(tmdb(30)),
		]);

		const result = await mappingHandlers.getMappings();

		const sonarrGroup = result.find(
			(group) => group.provider === "sonarr" && group.providerId === tvdb(10),
		);
		expect(sonarrGroup).toMatchObject({
			isInLibrary: true,
			providerMeta: {
				title: "Sonarr 10",
				statusLabel: "continuing",
				providerRouteSlug: "sonarr-10",
			},
			rows: [
				{
					anilistId: aid(1),
					mappingRowStatus: "in-library",
				},
				{
					anilistId: aid(2),
					aliases: [alias],
					mappingRowStatus: "in-library",
				},
			],
		});

		expect(
			result.find(
				(group) => group.provider === "radarr" && group.providerId === tmdb(30),
			),
		).toMatchObject({
			isInLibrary: true,
			providerMeta: {
				title: "Radarr 30",
				statusLabel: "released",
				providerRouteSlug: "radarr-30",
			},
		});

		expect(
			result.find((group) => group.key === "sonarr:ignored:anilist:4"),
		).toMatchObject({
			providerId: null,
			isInLibrary: false,
			rows: [
				{
					anilistId: aid(4),
					mappingRowStatus: "suppressed",
				},
			],
		});
	});

	it("uses the only ambiguous target already present in the library", async () => {
		const existingProviderId = tvdb(40);

		mockMappingRecords({
			sonarr: [
				mappingRecord(aid(40), "sonarr", {
					kind: "ambiguous",
					targets: [
						{
							provider: "sonarr",
							providerId: existingProviderId,
						},
						{
							provider: "sonarr",
							providerId: tvdb(41),
						},
					],
				}),
			],
		});
		getProviderConfigMock.mockResolvedValue(credentials);
		vi.mocked(sonarrLibrary.getSeriesSnapshots).mockResolvedValue([
			sonarrSeries(existingProviderId),
		]);

		await expect(mappingHandlers.getMappings()).resolves.toEqual([
			expect.objectContaining({
				provider: "sonarr",
				providerId: existingProviderId,
				isInLibrary: true,
				providerMeta: expect.objectContaining({
					title: "Sonarr 40",
				}),
				rows: [
					expect.objectContaining({
						anilistId: aid(40),
						mappingRowStatus: "in-library",
					}),
				],
			}),
		]);
	});

	it("rejects a manual target already linked to another AniList entry", async () => {
		const source = { source: "mal", id: mal(5114) } as const;

		vi.mocked(mappingService.getLinkedAniListIds).mockResolvedValue([aid(11)]);

		await expect(
			mappingHandlers.setManualMapping({
				provider: "sonarr",
				providerId: tvdb(20),
				source,
				anilistId: aid(10),
			}),
		).rejects.toMatchObject({
			code: ErrorCode.VALIDATION_ERROR,
			details: {
				conflictingAniListIds: [aid(11)],
			},
		});

		expect(mappingService.setManualMapping).not.toHaveBeenCalled();
		expect(bumpMappingsRevisionMock).not.toHaveBeenCalled();
	});

	it("keeps a MAL-only mutation when no AniList crosswalk exists", async () => {
		const source = { source: "mal", id: mal(5114) } as const;

		await expect(
			mappingHandlers.setMappingIgnore({
				source,
				provider: "sonarr",
			}),
		).resolves.toEqual({ ok: true });

		expect(getUniqueAniListIdForSource).toHaveBeenCalledWith(source);
		expect(mappingService.setIgnored).toHaveBeenCalledWith(
			"sonarr",
			source,
			undefined,
		);
		expect(bumpMappingsRevisionMock).toHaveBeenCalledOnce();
	});
});
