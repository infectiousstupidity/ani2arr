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
	getSourceAliasesByAniListId,
	getUniqueAniListIdForSource,
	getUniqueAniListIdsForSources,
} from "@/mapping/upstream.store";
import {
	mappingService,
	radarrLibrary,
	sonarrLibrary,
} from "@/background/api-services";
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
		getMovieSnapshots: vi.fn(async () => []),
	},
	sonarrLibrary: {
		getSeriesSnapshots: vi.fn(async () => []),
	},
}));

vi.mock("@/rpc/revision-signals", () => ({
	bumpMappingsRevision: bumpMappingsRevisionMock,
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

const sonarrMappings: EffectiveMappingRecord[] = [
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
	mappingRecord(aid(3), "sonarr", {
		kind: "mapped",
		source: "auto",
		providerId: tvdb(20),
	}),
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
		vi.mocked(getSourceAliasesByAniListId).mockResolvedValue(new Map());
		vi.mocked(getUniqueAniListIdForSource).mockResolvedValue(null);
		vi.mocked(getUniqueAniListIdsForSources).mockResolvedValue({});
		mockMappingRecords({ sonarr: sonarrMappings });
		getProviderConfigMock.mockResolvedValue(null);
		vi.mocked(sonarrLibrary.getSeriesSnapshots).mockResolvedValue([]);
		vi.mocked(radarrLibrary.getMovieSnapshots).mockResolvedValue([]);
	});

	it("delegates the complete alias batch to one pure store read", async () => {
		const directSource = anilistSource(aid(20));
		const malSource = { source: "mal", id: mal(5114) } as const;
		const resolvedIds = {
			"anilist:20": aid(20),
			"mal:5114": aid(21),
		};
		vi.mocked(getUniqueAniListIdsForSources).mockResolvedValue(resolvedIds);

		await expect(
			mappingHandlers.resolveAniListIdsForSources([directSource, malSource]),
		).resolves.toBe(resolvedIds);

		expect(getUniqueAniListIdsForSources).toHaveBeenCalledOnce();
		expect(getUniqueAniListIdsForSources).toHaveBeenCalledWith([
			directSource,
			malSource,
		]);
	});

	it("returns every composed mapping group without filtering", async () => {
		const result = await mappingHandlers.getMappings();

		expect(result).toHaveLength(2);
		expect(result[0]?.providerId).toBe(tvdb(10));
		expect(result[0]?.rows.map((row) => row.anilistId)).toEqual([
			aid(1),
			aid(2),
		]);
	});

	it("attaches MAL aliases to one canonical mapping row", async () => {
		const anilistId = aid(21);
		const alias = { source: "mal", id: mal(5114) } as const;
		mockMappingRecords({
			sonarr: [
				mappingRecord(anilistId, "sonarr", {
					kind: "mapped",
					source: "upstream",
					providerId: tvdb(10),
				}),
			],
		});
		vi.mocked(getSourceAliasesByAniListId).mockResolvedValue(
			new Map([[anilistId, [alias]]]),
		);

		const result = await mappingHandlers.getMappings();

		expect(result).toHaveLength(1);
		expect(result[0]?.rows).toEqual([
			expect.objectContaining({
				anilistId,
				aliases: [alias],
			}),
		]);
		expect(result[0]?.rows).toHaveLength(1);
		expect(getSourceAliasesByAniListId).toHaveBeenCalledOnce();
	});

	it("builds provider route metadata", async () => {
		const radarrProviderId = tmdb(30);
		mockMappingRecords({
			sonarr: sonarrMappings,
			radarr: [
				mappingRecord(aid(30), "radarr", {
					kind: "mapped",
					source: "auto",
					providerId: radarrProviderId,
				}),
			],
		});
		getProviderConfigMock.mockResolvedValue(credentials);
		vi.mocked(sonarrLibrary.getSeriesSnapshots).mockResolvedValue([
			sonarrSeries(tvdb(10)),
		]);
		vi.mocked(radarrLibrary.getMovieSnapshots).mockResolvedValue([
			radarrMovie(radarrProviderId),
		]);

		const result = await mappingHandlers.getMappings();
		const sonarrGroup = result.find(
			(item) => item.provider === "sonarr" && item.providerId === tvdb(10),
		);
		const radarrGroup = result.find((item) => item.provider === "radarr");

		expect(sonarrGroup?.providerMeta).toEqual({
			title: "Sonarr 10",
			statusLabel: "continuing",
			providerRouteSlug: "sonarr-10",
		});
		expect(radarrGroup?.providerMeta).toEqual({
			title: "Radarr 30",
			statusLabel: "released",
			providerRouteSlug: "radarr-30",
		});
	});

	it("uses the only existing ambiguous target", async () => {
		const existingProviderId = tvdb(40);
		const mappings = [
			mappingRecord(aid(40), "sonarr", {
				kind: "ambiguous",
				targets: [
					{ provider: "sonarr", providerId: existingProviderId },
					{ provider: "sonarr", providerId: tvdb(41) },
				],
			}),
		];
		mockMappingRecords({ sonarr: mappings });
		getProviderConfigMock.mockResolvedValue(credentials);
		vi.mocked(sonarrLibrary.getSeriesSnapshots).mockResolvedValue([
			sonarrSeries(existingProviderId),
		]);

		const result = await mappingHandlers.getMappings();

		expect(result[0]).toMatchObject({
			providerId: existingProviderId,
			isInLibrary: true,
			providerMeta: { title: "Sonarr 40" },
			rows: [
				{
					mappingRowStatus: "in-library",
				},
			],
		});
	});

	it("keeps groups without an active provider target", async () => {
		const mappings = [
			mappingRecord(aid(51), "sonarr", { kind: "ignored" }),
			mappingRecord(aid(52), "sonarr", {
				kind: "unmapped",
				hadResolveAttempt: false,
			}),
		];
		mockMappingRecords({ sonarr: mappings });

		const result = await mappingHandlers.getMappings();

		expect(result).toHaveLength(2);
		expect(result.map((group) => group.key)).toEqual(
			expect.arrayContaining(["sonarr:ignored:anilist:51"]),
		);
		expect(result).toEqual(
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

	it("uses the MAL source for a manual mapping and its AniList ID for the conflict check", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		vi.mocked(mappingService.getLinkedAniListIds).mockResolvedValueOnce([
			aid(10),
		]);

		await expect(
			mappingHandlers.setManualMapping({
				provider: "sonarr",
				providerId: tvdb(20),
				source,
				anilistId: aid(10),
			}),
		).resolves.toEqual({ ok: true });

		expect(mappingService.setManualMapping).toHaveBeenCalledWith(
			"sonarr",
			source,
			tvdb(20),
			aid(10),
		);
		expect(bumpMappingsRevisionMock).toHaveBeenCalledOnce();
	});

	it("keeps a MAL-only mutation when its crosswalk is missing", async () => {
		const source = { source: "mal", id: mal(5114) } as const;

		await expect(
			mappingHandlers.setMappingIgnore({
				source,
				provider: "sonarr",
			}),
		).resolves.toEqual({ ok: true });

		expect(mappingService.setIgnored).toHaveBeenCalledWith(
			"sonarr",
			source,
			undefined,
		);
		expect(getUniqueAniListIdForSource).toHaveBeenCalledWith(source);
		expect(bumpMappingsRevisionMock).toHaveBeenCalledOnce();
	});
});
