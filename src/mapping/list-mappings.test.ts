/** Tests for active mapping list grouping and identity discovery. */
// src/mapping/list-mappings.test.ts

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
	parseAniListId,
	type AniListId,
	type AniListMediaFormat,
} from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import {
	parseTmdbId,
	parseTvdbId,
} from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import type { ManualFacts } from "./manual.store";
import type { SourceIdentity } from "./source-identity";
import type {
	AutoResult,
	MappingResult,
	UpstreamTarget,
} from "./types";
import { getMappingIdentities, getMappingList, listMappings } from "./list-mappings";

const storeRecords = vi.hoisted(() => ({
	manual: [] as Array<{
		provider: Provider;
		anilistId?: AniListId;
		source?: SourceIdentity;
		facts: ManualFacts;
	}>,
	auto: [] as Array<{
		provider: Provider;
		anilistId?: AniListId;
		source?: SourceIdentity;
		result: AutoResult;
	}>,
	upstream: [] as Array<{
		anilistId?: AniListId;
		source?: SourceIdentity;
		targets: UpstreamTarget[];
	}>,
	crosswalks: [] as Array<{
		source: SourceIdentity;
		anilistId: AniListId;
	}>,
	sourceKey: (source: SourceIdentity): string => `${source.source}:${source.id}`,
	recordSource: (
		source: SourceIdentity | undefined,
		anilistId: AniListId | undefined,
	): SourceIdentity => {
		if (source) return source;
		if (anilistId !== undefined) return { source: "anilist", id: anilistId };
		throw new Error("Test record needs source or anilistId.");
	},
}));

vi.mock("./manual.store", () => ({
	listSourceManualFacts: vi.fn(async (provider: Provider) =>
		storeRecords.manual
			.filter((record) => record.provider === provider)
			.map(({ source, anilistId, facts }) => ({
				source: storeRecords.recordSource(source, anilistId),
				facts,
			})),
	),
}));

vi.mock("./auto.store", () => ({
	listSourceAutoResults: vi.fn(async (provider: Provider) =>
		storeRecords.auto
			.filter((record) => record.provider === provider)
			.map(({ source, anilistId, result }) => ({
				source: storeRecords.recordSource(source, anilistId),
				result,
			})),
	),
}));

vi.mock("./upstream.store", () => ({
	getUniqueAniListIdForSource: vi.fn(async (source: SourceIdentity) =>
		storeRecords.crosswalks.find(
			(record) => storeRecords.sourceKey(record.source) === storeRecords.sourceKey(source),
		)?.anilistId ?? null,
	),
	listSourceUpstreamMappings: vi.fn(async () =>
		storeRecords.upstream.map(({ source, anilistId, targets }) => ({
			source: storeRecords.recordSource(source, anilistId),
			targets,
		})),
	),
}));

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;
const anilistSource = (anilistId: AniListId) =>
	({ source: "anilist", id: anilistId }) as const;
const malSource = (id: ReturnType<typeof mal>) => ({ source: "mal", id }) as const;

const formatLoader = (
	formats: ReadonlyMap<AniListId, AniListMediaFormat | null | undefined>,
) => vi.fn(async () => formats);

describe("listMappings", () => {
	beforeEach(() => {
		storeRecords.manual = [];
		storeRecords.auto = [];
		storeRecords.upstream = [];
		storeRecords.crosswalks = [];
	});

	it("groups mapped results by provider target and keeps non-mapped buckets", () => {
		const result = listMappings("sonarr", [
			{
				source: anilistSource(aid(2)),
				anilistId: aid(2),
				result: { kind: "mapped", source: "manual", providerId: 22 },
			},
			{
				source: anilistSource(aid(1)),
				anilistId: aid(1),
				result: { kind: "mapped", source: "upstream", providerId: 22 },
			},
			{
				source: anilistSource(aid(3)),
				anilistId: aid(3),
				result: { kind: "ignored" },
			},
			{
				source: anilistSource(aid(4)),
				anilistId: aid(4),
				result: {
					kind: "ambiguous",
					targets: [{ provider: "sonarr", providerId: tvdb(44) }],
				},
			},
			{
				source: anilistSource(aid(5)),
				anilistId: aid(5),
				result: { kind: "unmapped", hadResolveAttempt: true },
			},
		]);

		expect(result.mapped).toEqual([
			{
				providerId: 22,
				entries: [
					expect.objectContaining({ anilistId: aid(1) }),
					expect.objectContaining({ anilistId: aid(2) }),
				],
			},
		]);
		expect(result.ignored).toHaveLength(1);
		expect(result.ambiguous).toHaveLength(1);
		expect(result.unmapped).toHaveLength(1);
	});

	it("groups Sonarr seasons for the same TVDB ID together", () => {
		const result = listMappings("sonarr", [
			{
				source: anilistSource(aid(171_018)),
				anilistId: aid(171_018),
				result: {
					kind: "mapped",
					source: "upstream",
					providerId: tvdb(432_832),
					season: 1,
				},
			},
			{
				source: anilistSource(aid(185_660)),
				anilistId: aid(185_660),
				result: {
					kind: "mapped",
					source: "upstream",
					providerId: tvdb(432_832),
					season: 2,
				},
			},
		]);

		expect(result.mapped).toEqual([
			{
				providerId: tvdb(432_832),
				entries: [
					expect.objectContaining({ anilistId: aid(171_018) }),
					expect.objectContaining({ anilistId: aid(185_660) }),
				],
			},
		]);
	});

	it("returns identities only for requested IDs with stored mapping facts", async () => {
		storeRecords.manual = [
			{
				provider: "sonarr",
				anilistId: aid(1),
				facts: { ignored: true },
			},
		];
		storeRecords.auto = [
			{
				provider: "radarr",
				anilistId: aid(3),
				result: { kind: "mapped", providerId: 303 },
			},
		];
		storeRecords.upstream = [
			{
				anilistId: aid(2),
				targets: [{ provider: "sonarr", providerId: tvdb(202) }],
			},
		];
		const resultByKey = new Map<string, MappingResult>([
			["sonarr:1", { kind: "ignored" }],
			[
				"sonarr:2",
				{ kind: "mapped", source: "upstream", providerId: 202 },
			],
			["radarr:3", { kind: "mapped", source: "auto", providerId: tmdb(303) }],
		]);
		const mappingService = {
			getMapping: vi.fn(async (provider: Provider, anilistId: AniListId) => {
				const result = resultByKey.get(`${provider}:${anilistId}`);
				if (!result) throw new Error("unexpected identity lookup");
				return result;
			}),
		};

		await expect(
			getMappingIdentities([aid(1), aid(2), aid(3), aid(4)], {
				mappingService,
			}),
		).resolves.toEqual([
			{
				source: anilistSource(aid(1)),
				anilistId: aid(1),
				provider: "sonarr",
				result: { kind: "ignored" },
			},
			{
				source: anilistSource(aid(2)),
				anilistId: aid(2),
				provider: "sonarr",
				result: { kind: "mapped", source: "upstream", providerId: 202 },
			},
			{
				source: anilistSource(aid(3)),
				anilistId: aid(3),
				provider: "radarr",
				result: { kind: "mapped", source: "auto", providerId: tmdb(303) },
			},
		]);
	});

	it("builds active mappings from one batch of stored facts", async () => {
		storeRecords.manual = [
			{
				provider: "sonarr",
				anilistId: aid(1),
				facts: { ignored: true },
			},
			{
				provider: "sonarr",
				anilistId: aid(2),
				facts: { mapping: { providerId: tvdb(22) } },
			},
			{
				provider: "sonarr",
				anilistId: aid(4),
				facts: { rejectedProviderIds: [tvdb(44)] },
			},
		];
		storeRecords.auto = [
			{
				provider: "sonarr",
				anilistId: aid(3),
				result: { kind: "mapped", providerId: tvdb(33) },
			},
			{
				provider: "sonarr",
				anilistId: aid(4),
				result: { kind: "mapped", providerId: tvdb(44) },
			},
			{
				provider: "sonarr",
				anilistId: aid(5),
				result: { kind: "mapped", providerId: tvdb(56) },
			},
		];
		storeRecords.upstream = [
			{
				anilistId: aid(2),
				targets: [{ provider: "sonarr", providerId: tvdb(22) }],
			},
			{
				anilistId: aid(5),
				targets: [
					{ provider: "sonarr", providerId: tvdb(55) },
					{ provider: "sonarr", providerId: tvdb(56) },
				],
			},
		];

		const result = await getMappingList("sonarr");

		expect(result.ignored).toHaveLength(1);
		expect(result.mapped).toEqual([
			expect.objectContaining({
				providerId: tvdb(22),
				entries: [
					expect.objectContaining({
						anilistId: aid(2),
						result: expect.objectContaining({ source: "upstream" }),
					}),
				],
			}),
			expect.objectContaining({
				providerId: tvdb(33),
				entries: [
					expect.objectContaining({
						anilistId: aid(3),
						result: expect.objectContaining({ source: "auto" }),
					}),
				],
			}),
			expect.objectContaining({
				providerId: tvdb(56),
				entries: [
					expect.objectContaining({
						anilistId: aid(5),
						result: expect.objectContaining({ source: "auto" }),
					}),
				],
			}),
		]);
		expect(result.unmapped).toEqual([
			expect.objectContaining({
				anilistId: aid(4),
				result: expect.objectContaining({ rejectedProviderIds: [tvdb(44)] }),
			}),
		]);
		expect(result.ambiguous).toHaveLength(0);
	});

	it("includes MAL source mappings when AniBridge has a unique AniList crosswalk", async () => {
		const source = malSource(mal(5114));
		storeRecords.crosswalks = [{ source, anilistId: aid(10) }];
		storeRecords.manual = [
			{
				provider: "sonarr",
				source,
				facts: { mapping: { providerId: tvdb(78_874) } },
			},
		];

		const result = await getMappingList("sonarr");

		expect(result.mapped).toEqual([
			expect.objectContaining({
				providerId: tvdb(78_874),
				entries: [
					expect.objectContaining({
						source,
						anilistId: aid(10),
						result: expect.objectContaining({ source: "manual" }),
					}),
				],
			}),
		]);
	});

	it("uses Radarr only for movie upstream records with both Radarr and Sonarr targets", async () => {
		const anilistId = aid(1101);
		storeRecords.upstream = [
			{
				anilistId,
				targets: [
					{ provider: "sonarr", providerId: tvdb(79_620), season: 0 },
					{ provider: "sonarr", providerId: tvdb(80_009), season: 0 },
					{ provider: "radarr", providerId: tmdb(34_194) },
				],
			},
		];
		const loadFormatByAniListId = formatLoader(
			new Map([[anilistId, "MOVIE"]]),
		);

		const sonarr = await getMappingList("sonarr", { loadFormatByAniListId });
		const radarr = await getMappingList("radarr", { loadFormatByAniListId });

		expect(sonarr.mapped).toHaveLength(0);
		expect(sonarr.ambiguous).toHaveLength(0);
		expect(sonarr.unmapped).toHaveLength(0);
		expect(radarr.mapped).toEqual([
			expect.objectContaining({
				providerId: tmdb(34_194),
				entries: [
					expect.objectContaining({
						anilistId,
						result: {
							kind: "mapped",
							source: "upstream",
							providerId: tmdb(34_194),
						},
					}),
				],
			}),
		]);
	});

	it.each([
		["OVA format", new Map([[aid(2001), "OVA" as const]])],
		["missing format", new Map<AniListId, AniListMediaFormat>()],
	])("keeps Sonarr upstream candidates for %s", async (_name, formats) => {
		const anilistId = aid(2001);
		const sonarrTargets = [
			{ provider: "sonarr" as const, providerId: tvdb(10), season: 0 },
			{ provider: "sonarr" as const, providerId: tvdb(20), season: 0 },
		];
		storeRecords.upstream = [
			{
				anilistId,
				targets: [
					...sonarrTargets,
					{ provider: "radarr", providerId: tmdb(30) },
				],
			},
		];

		const result = await getMappingList("sonarr", {
			loadFormatByAniListId: formatLoader(formats),
		});

		expect(result.ambiguous).toEqual([
			{
				source: anilistSource(anilistId),
				anilistId,
				result: {
					kind: "ambiguous",
					targets: sonarrTargets,
				},
			},
		]);
	});
});
