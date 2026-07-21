/** Tests for mapping precedence and linked AniList ID discovery. */
// src/mapping/mapping.service.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId, type AniListId } from "@/anilist/types";
import {
	parseTmdbId,
	parseTvdbId,
} from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import type { ManualFacts } from "./manual.store";
import { MappingService } from "./mapping.service";
import {
	type AutoResult,
	type MappingResult,
	type UpstreamTarget,
} from "./types";

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
	getManualFacts: vi.fn(async (provider: Provider, anilistId: AniListId) =>
		storeRecords.manual.find(
			(record) =>
				record.provider === provider &&
				record.anilistId === anilistId,
		)?.facts ?? null,
	),
	listAniListManualFacts: vi.fn(async (provider: Provider) =>
		storeRecords.manual
			.filter((record) => record.provider === provider)
			.map((record) => ({
				anilistId: record.anilistId,
				facts: record.facts,
			})),
	),
	clearIgnored: vi.fn(),
	clearManualMapping: vi.fn(),
	clearRejectedAutoCandidate: vi.fn(),
	rejectAutoCandidate: vi.fn(),
	setIgnored: vi.fn(),
	setManualMapping: vi.fn(),
}));

vi.mock("./auto.store", () => ({
	getAutoResult: vi.fn(async (provider: Provider, anilistId: AniListId) =>
		storeRecords.auto.find(
			(record) =>
				record.provider === provider &&
				record.anilistId === anilistId,
		)?.result ?? null,
	),
	listAniListAutoResults: vi.fn(async (provider: Provider) =>
		storeRecords.auto
			.filter((record) => record.provider === provider)
			.map((record) => ({
				anilistId: record.anilistId,
				result: record.result,
			})),
	),
}));

vi.mock("./upstream.store", () => ({
	getUpstreamTargets: vi.fn(async (provider: Provider, anilistId: AniListId) =>
		(storeRecords.upstream.find(
			(record) => record.anilistId === anilistId,
		)
			?.targets ?? []
		).filter((target) => target.provider === provider),
	),
	listAniListUpstreamMappings: vi.fn(async () => storeRecords.upstream),
}));

const aid = parseAniListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

const service = () => new MappingService(vi.fn());
const replaceAuto = (
	provider: Provider,
	anilistId: AniListId,
	result: AutoResult,
): void => {
	storeRecords.auto = storeRecords.auto.filter(
		(record) =>
			record.provider !== provider || record.anilistId !== anilistId,
	);
	storeRecords.auto.push({ provider, anilistId, result });
};

function resetRecords(): void {
	storeRecords.manual = [];
	storeRecords.auto = [];
	storeRecords.upstream = [];
}

describe("MappingService", () => {
	beforeEach(() => {
		resetRecords();
	});

	it("chooses the active mapping source by precedence", async () => {
		const cases: Array<{
			name: string;
			provider: Provider;
			manual?: ManualFacts;
			upstream?: UpstreamTarget[];
			auto?: AutoResult;
			expected: MappingResult;
		}> = [
			{
				name: "ignored beats all",
				provider: "radarr",
				manual: { ignored: true },
				upstream: [{ provider: "radarr", providerId: tmdb(10) }],
				auto: { kind: "mapped", providerId: tmdb(20) },
				expected: { kind: "ignored" },
			},
			{
				name: "manual different from upstream wins",
				provider: "radarr",
				manual: { mapping: { providerId: tmdb(20) } },
				upstream: [{ provider: "radarr", providerId: tmdb(10) }],
				expected: {
					kind: "mapped",
					source: "manual",
					providerId: tmdb(20),
				},
			},
			{
				name: "manual equal to upstream resolves as upstream",
				provider: "radarr",
				manual: { mapping: { providerId: tmdb(10) } },
				upstream: [{ provider: "radarr", providerId: tmdb(10) }],
				expected: {
					kind: "mapped",
					source: "upstream",
					providerId: tmdb(10),
				},
			},
			{
				name: "manual chosen while upstream is ambiguous remains manual",
				provider: "sonarr",
				manual: { mapping: { providerId: tvdb(30), season: 2 } },
				upstream: [
					{ provider: "sonarr", providerId: tvdb(10), season: 1 },
					{ provider: "sonarr", providerId: tvdb(20), season: 2 },
				],
				expected: {
					kind: "mapped",
					source: "manual",
					providerId: tvdb(30),
					season: 2,
				},
			},
			{
				name: "single upstream target maps automatically",
				provider: "sonarr",
				upstream: [{ provider: "sonarr", providerId: tvdb(10), season: 1 }],
				expected: {
					kind: "mapped",
					source: "upstream",
					providerId: tvdb(10),
					season: 1,
				},
			},
			{
				name: "multiple upstream targets return ambiguous",
				provider: "sonarr",
				upstream: [
					{ provider: "sonarr", providerId: tvdb(10), season: 1 },
					{ provider: "sonarr", providerId: tvdb(20), season: 2 },
				],
				expected: {
					kind: "ambiguous",
					targets: [
						{ provider: "sonarr", providerId: tvdb(10), season: 1 },
						{ provider: "sonarr", providerId: tvdb(20), season: 2 },
					],
				},
			},
			{
				name: "auto cannot choose one ambiguous upstream target",
				provider: "sonarr",
				upstream: [
					{ provider: "sonarr", providerId: tvdb(262_094), season: 0 },
					{ provider: "sonarr", providerId: tvdb(310_718), season: 1 },
				],
				auto: { kind: "mapped", providerId: tvdb(310_718) },
				expected: {
					kind: "ambiguous",
					targets: [
						{ provider: "sonarr", providerId: tvdb(262_094), season: 0 },
						{ provider: "sonarr", providerId: tvdb(310_718), season: 1 },
					],
				},
			},
			{
				name: "auto outside ambiguous upstream targets is ignored",
				provider: "sonarr",
				upstream: [
					{ provider: "sonarr", providerId: tvdb(262_094), season: 0 },
					{ provider: "sonarr", providerId: tvdb(310_718), season: 1 },
				],
				auto: { kind: "mapped", providerId: tvdb(999_999) },
				expected: {
					kind: "ambiguous",
					targets: [
						{ provider: "sonarr", providerId: tvdb(262_094), season: 0 },
						{ provider: "sonarr", providerId: tvdb(310_718), season: 1 },
					],
				},
			},
			{
				name: "auto result used when no manual or upstream exists",
				provider: "radarr",
				auto: { kind: "mapped", providerId: tmdb(30), matchedTitle: "Match" },
				expected: {
					kind: "mapped",
					source: "auto",
					providerId: tmdb(30),
					matchedTitle: "Match",
				},
			},
			{
				name: "rejected auto candidate returns unmapped",
				provider: "radarr",
				manual: { rejectedProviderIds: [tmdb(30)] },
				auto: { kind: "mapped", providerId: tmdb(30) },
				expected: {
					kind: "unmapped",
					hadResolveAttempt: true,
					rejectedProviderIds: [tmdb(30)],
				},
			},
		];

		for (const [index, testCase] of cases.entries()) {
			resetRecords();
			const anilistId = aid(index + 1);
			const { provider } = testCase;

			if (testCase.manual) {
				storeRecords.manual.push({
					provider,
					anilistId,
					facts: testCase.manual,
				});
			}
			if (testCase.upstream) {
				storeRecords.upstream.push({
					anilistId,
					targets: testCase.upstream,
				});
			}
			if (testCase.auto) {
				storeRecords.auto.push({
					provider,
					anilistId,
					result: testCase.auto,
				});
			}

			await expect(service().getMapping(provider, anilistId)).resolves.toEqual(
				testCase.expected,
			);
		}
	});

	it("computes linked AniList IDs for multiple provider IDs in one scan", async () => {
		storeRecords.upstream = [
			{
				anilistId: aid(30),
				targets: [{ provider: "radarr", providerId: tmdb(300) }],
			},
			{
				anilistId: aid(10),
				targets: [{ provider: "radarr", providerId: tmdb(100) }],
			},
			{
				anilistId: aid(40),
				targets: [{ provider: "radarr", providerId: tmdb(400) }],
			},
		];
		storeRecords.auto = [
			{
				provider: "radarr",
				anilistId: aid(20),
				result: { kind: "mapped", providerId: tmdb(100) },
			},
			{
				provider: "radarr",
				anilistId: aid(30),
				result: { kind: "mapped", providerId: tmdb(200) },
			},
			{
				provider: "radarr",
				anilistId: aid(40),
				result: { kind: "mapped", providerId: tmdb(100) },
			},
		];
		storeRecords.manual = [
			{
				provider: "radarr",
				anilistId: aid(30),
				facts: { mapping: { providerId: tmdb(100) } },
			},
			{
				provider: "radarr",
				anilistId: aid(40),
				facts: { ignored: true },
			},
			{
				provider: "radarr",
				anilistId: aid(50),
				facts: { mapping: { providerId: tmdb(200) } },
			},
		];

		const linked = await service().getLinkedAniListIdsByProviderIds(
			"radarr",
			[tmdb(100), tmdb(200), tmdb(100)],
		);

		expect([...linked.entries()]).toEqual([
			[tmdb(100), [aid(10), aid(20), aid(30)]],
			[tmdb(200), [aid(50)]],
		]);
	});

	it("returns each linked AniList ID once when mapping facts overlap", async () => {
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

		await expect(
			service().getLinkedAniListIds("sonarr", tvdb(78_874)),
		).resolves.toEqual([aid(10)]);
	});

	it("retries cached unmapped auto results only when forced", async () => {
		const anilistId = aid(20);
		const resolver = vi.fn(async () => {
			replaceAuto("sonarr", anilistId, {
				kind: "mapped",
				providerId: tvdb(200),
				matchedTitle: "Kagurabachi",
			});
			return true;
		});
		replaceAuto("sonarr", anilistId, { kind: "unmapped" });
		const mappingService = new MappingService(resolver);

		await expect(
			mappingService.resolveMapping("sonarr", anilistId),
		).resolves.toEqual({
			kind: "unmapped",
			hadResolveAttempt: true,
		});
		expect(resolver).not.toHaveBeenCalled();

		await expect(
			mappingService.resolveMapping("sonarr", anilistId, {
				forceRetry: true,
				title: "Kagurabachi",
			}),
		).resolves.toEqual({
			kind: "mapped",
			source: "auto",
			providerId: tvdb(200),
			matchedTitle: "Kagurabachi",
		});
		expect(resolver).toHaveBeenCalledWith("sonarr", anilistId, [], {
			title: "Kagurabachi",
		});
	});

	it("never resolves ambiguous upstream targets, including forced retries", async () => {
		const anilistId = aid(22);
		storeRecords.upstream = [
			{
				anilistId,
				targets: [
					{ provider: "sonarr", providerId: tvdb(262_094), season: 0 },
					{ provider: "sonarr", providerId: tvdb(310_718), season: 1 },
				],
			},
		];
		replaceAuto("sonarr", anilistId, { kind: "unmapped" });
		const resolver = vi.fn();

		await expect(
			new MappingService(resolver).resolveMapping("sonarr", anilistId, {
				forceRetry: true,
				title: "Magi: Sinbad no Bouken",
			}),
		).resolves.toEqual({
			kind: "ambiguous",
			targets: [
				{ provider: "sonarr", providerId: tvdb(262_094), season: 0 },
				{ provider: "sonarr", providerId: tvdb(310_718), season: 1 },
			],
		});
		expect(resolver).not.toHaveBeenCalled();
	});
});
