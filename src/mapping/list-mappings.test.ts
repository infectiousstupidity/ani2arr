/** Tests for flat effective mapping records and identity discovery. */
// src/mapping/list-mappings.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	parseAniListId,
	type AniListId,
	type AniListMediaFormat,
} from "@/anilist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import type { ManualFacts } from "./manual.store";
import type { SourceIdentity } from "./source-identity";
import type { AutoResult, UpstreamTarget } from "./types";
import { listAniListUpstreamMappings } from "./upstream.store";
import {
	getMappingIdentities,
	listEffectiveMappingRecordsByProvider,
} from "./list-mappings";

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

const aid = parseAniListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;
const anilistSource = (id: AniListId): SourceIdentity => ({
	source: "anilist",
	id,
});
const formatLoader = (
	formats: ReadonlyMap<AniListId, AniListMediaFormat | null | undefined>,
) => vi.fn(async () => formats);

describe("effective mapping records", () => {
	beforeEach(() => {
		storeRecords.manual = [];
		storeRecords.auto = [];
		storeRecords.upstream = [];
		vi.clearAllMocks();
	});

	it("returns one flat effective record list per provider", async () => {
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
		];
		storeRecords.auto = [
			{
				provider: "sonarr",
				anilistId: aid(3),
				result: { kind: "mapped", providerId: tvdb(33) },
			},
		];
		storeRecords.upstream = [
			{
				anilistId: aid(2),
				targets: [{ provider: "sonarr", providerId: tvdb(22) }],
			},
		];

		const result = await listEffectiveMappingRecordsByProvider();

		expect(result.sonarr).toEqual(
			expect.arrayContaining([
				{
					anilistId: aid(1),
					provider: "sonarr",
					result: { kind: "ignored" },
				},
				{
					anilistId: aid(2),
					provider: "sonarr",
					result: {
						kind: "mapped",
						source: "upstream",
						providerId: tvdb(22),
					},
				},
				{
					anilistId: aid(3),
					provider: "sonarr",
					result: {
						kind: "mapped",
						source: "auto",
						providerId: tvdb(33),
					},
				},
			]),
		);
	});

	it("returns one canonical record when manual and upstream facts overlap", async () => {
		storeRecords.manual = [
			{
				provider: "sonarr",
				anilistId: aid(10),
				facts: { mapping: { providerId: tvdb(78_874) } },
			},
		];
		storeRecords.upstream = [
			{
				anilistId: aid(10),
				targets: [{ provider: "sonarr", providerId: tvdb(78_874) }],
			},
		];

		const result = await listEffectiveMappingRecordsByProvider();

		expect(result.sonarr).toEqual([
			{
				anilistId: aid(10),
				provider: "sonarr",
				result: {
					kind: "mapped",
					source: "upstream",
					providerId: tvdb(78_874),
				},
			},
		]);
		expect(listAniListUpstreamMappings).toHaveBeenCalledOnce();
	});

	it("reads one upstream snapshot for the complete provider list", async () => {
		storeRecords.upstream = [
			{
				anilistId: aid(1),
				targets: [
					{ provider: "sonarr", providerId: tvdb(10) },
					{ provider: "radarr", providerId: tmdb(20) },
				],
			},
		];

		const result = await listEffectiveMappingRecordsByProvider();

		expect(result.sonarr[0]?.provider).toBe("sonarr");
		expect(result.radarr[0]?.provider).toBe("radarr");
		expect(listAniListUpstreamMappings).toHaveBeenCalledOnce();
	});

	it("uses Radarr only for movie upstream facts with both Arr targets", async () => {
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
		const result = await listEffectiveMappingRecordsByProvider({
			loadFormatByAniListId: formatLoader(
				new Map([[anilistId, "MOVIE"]]),
			),
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
});

describe("getMappingIdentities", () => {
	beforeEach(() => {
		storeRecords.manual = [];
		storeRecords.auto = [];
		storeRecords.upstream = [];
		vi.clearAllMocks();
	});

	it("returns requested AniList identities in ID and provider order", async () => {
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
				anilistId: aid(1),
				result: { kind: "mapped", providerId: tmdb(101) },
			},
			{
				provider: "radarr",
				anilistId: aid(3),
				result: { kind: "mapped", providerId: tmdb(303) },
			},
		];
		storeRecords.upstream = [
			{
				anilistId: aid(2),
				targets: [{ provider: "sonarr", providerId: tvdb(202) }],
			},
		];

		await expect(
			getMappingIdentities([aid(3), aid(1), aid(2), aid(4)]),
		).resolves.toEqual([
			{
				source: anilistSource(aid(3)),
				anilistId: aid(3),
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: tmdb(303),
				},
			},
			{
				source: anilistSource(aid(1)),
				anilistId: aid(1),
				provider: "sonarr",
				result: { kind: "ignored" },
			},
			{
				source: anilistSource(aid(1)),
				anilistId: aid(1),
				provider: "radarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: tmdb(101),
				},
			},
			{
				source: anilistSource(aid(2)),
				anilistId: aid(2),
				provider: "sonarr",
				result: {
					kind: "mapped",
					source: "upstream",
					providerId: tvdb(202),
				},
			},
		]);
	});
});
