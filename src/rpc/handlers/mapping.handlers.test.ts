/** Tests for mapping RPC listing composition and mapping writes. */
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
import type { Provider } from "@/providers/types";
import type { EffectiveMappingRecord } from "@/mapping/mapping-facts";
import {
	getMappingRowMutationInput,
	type MappingRow,
} from "@/options-page/pages/mappings/mapping-page-model";
import {
	mappingService,
	radarrLibrary,
	sonarrLibrary,
} from "@/background/api-services";
import { mappingHandlers } from "./mapping.handlers";

const listEffectiveMappingRecordsByProviderMock = vi.hoisted(() => vi.fn());
const getProviderConfigMock = vi.hoisted(() => vi.fn());

vi.mock("@/mapping/list-mappings", () => ({
	getMappingIdentities: vi.fn(),
	listEffectiveMappingRecordsByProvider:
		listEffectiveMappingRecordsByProviderMock,
}));

vi.mock("@/mapping/upstream.store", () => ({
	getUniqueAniListIdForSource: vi.fn(),
	refreshUpstreamMappings: vi.fn(),
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

const sonarrMappings: EffectiveMappingRecord[] = [
	{
		source: anilistSource(aid(1)),
		anilistId: aid(1),
		provider: "sonarr",
		result: { kind: "mapped", source: "manual", providerId: tvdb(10) },
	},
	{
		source: anilistSource(aid(2)),
		anilistId: aid(2),
		provider: "sonarr",
		result: { kind: "mapped", source: "auto", providerId: tvdb(10) },
	},
	{
		source: anilistSource(aid(3)),
		anilistId: aid(3),
		provider: "sonarr",
		result: { kind: "mapped", source: "auto", providerId: tvdb(20) },
	},
];

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
		vi.clearAllMocks();
		mockMappingRecords({ sonarr: sonarrMappings });
		getProviderConfigMock.mockResolvedValue(null);
		vi.mocked(sonarrLibrary.getSeriesSnapshots).mockResolvedValue([]);
		vi.mocked(radarrLibrary.getMovieSnapshots).mockResolvedValue([]);
	});

	it("returns every composed mapping group without filtering", async () => {
		const result = await mappingHandlers.getMappings();

		expect(result).not.toHaveProperty("total");
		expect(result.groups).toHaveLength(2);
		expect(result.groups[0]?.providerId).toBe(tvdb(10));
		expect(result.groups[0]?.rows.map((row) => row.anilistId)).toEqual([
			aid(1),
			aid(2),
		]);
		expect(result.groups[0]?.linkedAniListIds).toEqual([aid(1), aid(2)]);
		expect(listEffectiveMappingRecordsByProviderMock).toHaveBeenCalledOnce();
	});

	it("builds Sonarr route metadata", async () => {
		getProviderConfigMock.mockResolvedValue(credentials);
		vi.mocked(sonarrLibrary.getSeriesSnapshots).mockResolvedValue([
			sonarrSeries(tvdb(10)),
		]);

		const result = await mappingHandlers.getMappings();
		const group = result.groups.find(
			(item) => item.provider === "sonarr" && item.providerId === tvdb(10),
		);

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
		const mappings: EffectiveMappingRecord[] = [
			{
				source: anilistSource(aid(30)),
				anilistId: aid(30),
				provider: "radarr",
				result: { kind: "mapped", source: "auto", providerId },
			},
		];
		mockMappingRecords({ radarr: mappings });
		getProviderConfigMock.mockResolvedValue(credentials);
		vi.mocked(radarrLibrary.getMovieSnapshots).mockResolvedValue([
			radarrMovie(providerId),
		]);

		const result = await mappingHandlers.getMappings();
		const group = result.groups.find((item) => item.provider === "radarr");

		expect(group?.providerMeta).toEqual({
			title: "Radarr 30",
			type: "movie",
			statusLabel: "released",
			providerRouteSlug: "radarr-30",
		});
		expect(group?.rows[0]?.providerMeta).toEqual(group?.providerMeta);
	});

	it("uses the only existing ambiguous target", async () => {
		const existingProviderId = tvdb(40);
		const mappings: EffectiveMappingRecord[] = [
			{
				source: anilistSource(aid(40)),
				anilistId: aid(40),
				provider: "sonarr",
				result: {
					kind: "ambiguous",
					targets: [
						{ provider: "sonarr", providerId: existingProviderId },
						{ provider: "sonarr", providerId: tvdb(41) },
					],
				},
			},
		];
		mockMappingRecords({ sonarr: mappings });
		getProviderConfigMock.mockResolvedValue(credentials);
		vi.mocked(sonarrLibrary.getSeriesSnapshots).mockResolvedValue([
			sonarrSeries(existingProviderId),
		]);

		const result = await mappingHandlers.getMappings();

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
		const mappings: EffectiveMappingRecord[] = [
			{
				source: anilistSource(aid(51)),
				anilistId: aid(51),
				provider: "sonarr",
				result: { kind: "ignored" },
			},
			{
				source: { source: "mal", id: mal(5114) },
				anilistId: aid(51),
				provider: "sonarr",
				result: { kind: "ignored" },
			},
			{
				source: anilistSource(aid(52)),
				anilistId: aid(52),
				provider: "sonarr",
				result: { kind: "unmapped", hadResolveAttempt: false },
			},
		];
		mockMappingRecords({ sonarr: mappings });

		const result = await mappingHandlers.getMappings();

		expect(result.groups).toHaveLength(3);
		expect(result.groups.map((group) => group.key)).toEqual(
			expect.arrayContaining([
				"sonarr:ignored:anilist:51",
				"sonarr:ignored:mal:5114",
			]),
		);
		expect(result.groups).toEqual(
			expect.arrayContaining([
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

	it("keeps a MAL row source in quick-action RPC input", async () => {
		const row: MappingRow = {
			source: { source: "mal", id: mal(5114) },
			anilistId: aid(10),
			provider: "sonarr",
			providerId: null,
			result: { kind: "unmapped", hadResolveAttempt: false },
			isInLibrary: false,
			mappingRowStatus: "unmapped",
		};

		await expect(
			mappingHandlers.setMappingIgnore(getMappingRowMutationInput(row)),
		).resolves.toEqual({ ok: true });

		expect(mappingService.setIgnored).toHaveBeenCalledWith("sonarr", {
			source: "mal",
			id: mal(5114),
		});
	});
});
