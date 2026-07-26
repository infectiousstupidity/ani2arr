/** Tests for flat effective mapping records and identity discovery. */
// src/mapping/list-mappings.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	type AniListId,
	type AniListMediaFormat,
	parseAniListId,
} from "@/anilist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import {
	getMappingIdentities,
	listEffectiveMappingRecordsByProvider,
} from "./list-mappings";
import type { ManualFacts } from "./manual.store";
import type { AutoResult, UpstreamTarget } from "./types";
import { listAniListUpstreamMappings } from "./upstream.store";

const aid = parseAniListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

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
	listAniListManualFacts: vi.fn(async (provider: Provider) =>
		storeRecords.manual
			.filter((record) => record.provider === provider)
			.map(({ anilistId, facts }) => ({ anilistId, facts })),
	),
}));

vi.mock("./auto.store", () => ({
	listAniListAutoResults: vi.fn(async (provider: Provider) =>
		storeRecords.auto
			.filter((record) => record.provider === provider)
			.map(({ anilistId, result }) => ({ anilistId, result })),
	),
}));

vi.mock("./upstream.store", () => ({
	listAniListUpstreamMappings: vi.fn(async () => storeRecords.upstream),
}));

const manualRecord = (provider: Provider, id: number, facts: ManualFacts) => ({
	provider,
	anilistId: aid(id),
	facts,
});

const autoRecord = (provider: Provider, id: number, result: AutoResult) => ({
	provider,
	anilistId: aid(id),
	result,
});

const upstreamRecord = (id: number, targets: UpstreamTarget[]) => ({
	anilistId: aid(id),
	targets,
});

const formatLoader = (
	formats: ReadonlyMap<AniListId, AniListMediaFormat | null | undefined>,
) => vi.fn(async () => formats);

describe("list mappings", () => {
	beforeEach(() => {
		storeRecords.manual = [];
		storeRecords.auto = [];
		storeRecords.upstream = [];
		vi.clearAllMocks();
	});

	it("combines store records, splits providers, and shares one upstream read", async () => {
		storeRecords.manual = [manualRecord("sonarr", 1, { ignored: true })];
		storeRecords.auto = [
			autoRecord("radarr", 2, {
				kind: "mapped",
				providerId: tmdb(22),
			}),
		];
		storeRecords.upstream = [
			upstreamRecord(3, [
				{ provider: "sonarr", providerId: tvdb(33) },
				{ provider: "radarr", providerId: tmdb(44) },
			]),
		];

		const result = await listEffectiveMappingRecordsByProvider();
		const projection = [...result.sonarr, ...result.radarr].map(
			({ anilistId, provider, result: mapping }) => [
				anilistId,
				provider,
				mapping.kind,
				mapping.kind === "mapped" ? mapping.source : null,
				mapping.kind === "mapped" ? mapping.providerId : null,
			],
		);

		expect(projection).toEqual(
			expect.arrayContaining([
				[aid(1), "sonarr", "ignored", null, null],
				[aid(2), "radarr", "mapped", "auto", tmdb(22)],
				[aid(3), "sonarr", "mapped", "upstream", tvdb(33)],
				[aid(3), "radarr", "mapped", "upstream", tmdb(44)],
			]),
		);
		expect(projection).toHaveLength(4);
		expect(listAniListUpstreamMappings).toHaveBeenCalledOnce();
	});

	it("routes movie upstream mappings only to Radarr", async () => {
		const anilistId = aid(1101);
		storeRecords.upstream = [
			upstreamRecord(1101, [
				{
					provider: "sonarr",
					providerId: tvdb(79_620),
					season: 0,
				},
				{
					provider: "sonarr",
					providerId: tvdb(80_009),
					season: 0,
				},
				{ provider: "radarr", providerId: tmdb(34_194) },
			]),
		];

		const result = await listEffectiveMappingRecordsByProvider({
			loadFormatByAniListId: formatLoader(new Map([[anilistId, "MOVIE"]])),
		});

		expect(result.sonarr).toEqual([]);
		expect(result.radarr).toEqual([
			{
				anilistId,
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "upstream",
					providerId: tmdb(34_194),
				},
			},
		]);
	});

	it("returns requested identities in AniList ID and provider order", async () => {
		storeRecords.manual = [manualRecord("sonarr", 1, { ignored: true })];
		storeRecords.auto = [
			autoRecord("radarr", 1, {
				kind: "mapped",
				providerId: tmdb(101),
			}),
			autoRecord("radarr", 3, {
				kind: "mapped",
				providerId: tmdb(303),
			}),
		];
		storeRecords.upstream = [
			upstreamRecord(2, [{ provider: "sonarr", providerId: tvdb(202) }]),
		];

		const result = await getMappingIdentities([aid(3), aid(1), aid(2), aid(4)]);

		expect(
			result.map(({ anilistId, provider, result: mapping }) => [
				anilistId,
				provider,
				mapping.kind,
				mapping.kind === "mapped" ? mapping.source : null,
			]),
		).toEqual([
			[aid(3), "radarr", "mapped", "auto"],
			[aid(1), "sonarr", "ignored", null],
			[aid(1), "radarr", "mapped", "auto"],
			[aid(2), "sonarr", "mapped", "upstream"],
		]);

		expect(
			result.every(
				({ source, anilistId }) =>
					source.source === "anilist" && source.id === anilistId,
			),
		).toBe(true);
	});
});
