/** Tests for active mapping list grouping and identity discovery. */
// src/mapping/list-mappings.test.ts

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
	parseAniListId,
	type AniListId,
	type AniListMediaFormat,
} from "@/anilist/types";
import {
	parseTmdbId,
	parseTvdbId,
} from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import type { ManualFacts } from "./manual.store";
import type { AutoResult, MappingResult, UpstreamTarget } from "./types";
import { getMappingIdentities, getMappingList, listMappings } from "./list-mappings";

const storeRecords = vi.hoisted(() => ({
	manual: [] as Array<{
		provider: Provider;
		anilistId: AniListId;
		facts: ManualFacts;
	}>,
	auto: [] as Array<{
		provider: Provider;
		anilistId: AniListId;
		result: AutoResult;
	}>,
	upstream: [] as Array<{
		anilistId: AniListId;
		targets: UpstreamTarget[];
	}>,
}));

vi.mock("./manual.store", () => ({
	listManualFacts: vi.fn(async (provider: Provider) =>
		storeRecords.manual
			.filter((record) => record.provider === provider)
			.map(({ anilistId, facts }) => ({ anilistId, facts })),
	),
}));

vi.mock("./auto.store", () => ({
	listAutoResults: vi.fn(async (provider: Provider) =>
		storeRecords.auto
			.filter((record) => record.provider === provider)
			.map(({ anilistId, result }) => ({ anilistId, result })),
	),
}));

vi.mock("./upstream.store", () => ({
	listUpstreamMappings: vi.fn(async () => storeRecords.upstream),
}));

const aid = parseAniListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

const formatLoader = (
	formats: ReadonlyMap<AniListId, AniListMediaFormat | null | undefined>,
) => vi.fn(async () => formats);

describe("listMappings", () => {
	beforeEach(() => {
		storeRecords.manual = [];
		storeRecords.auto = [];
		storeRecords.upstream = [];
	});

	it("groups mapped results by provider target and keeps non-mapped buckets", () => {
		const result = listMappings("sonarr", [
			{
				anilistId: aid(2),
				result: { kind: "mapped", source: "manual", providerId: 22 },
			},
			{
				anilistId: aid(1),
				result: { kind: "mapped", source: "upstream", providerId: 22 },
			},
			{ anilistId: aid(3), result: { kind: "ignored" } },
			{
				anilistId: aid(4),
				result: {
					kind: "ambiguous",
					targets: [{ provider: "sonarr", providerId: tvdb(44) }],
				},
			},
			{
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
			{ anilistId: aid(1), provider: "sonarr", result: { kind: "ignored" } },
			{
				anilistId: aid(2),
				provider: "sonarr",
				result: { kind: "mapped", source: "upstream", providerId: 202 },
			},
			{
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
				anilistId,
				result: {
					kind: "ambiguous",
					targets: sonarrTargets,
				},
			},
		]);
	});
});
