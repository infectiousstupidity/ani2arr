/** Tests for mapping precedence and linked AniList ID discovery. */
// src/mapping/mapping.service.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId, type AniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import {
	parseTmdbId,
	parseTvdbId,
} from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import type { ManualFacts } from "./manual.store";
import { MappingService } from "./mapping.service";
import {
	sourceIdentityKey,
	type SourceIdentity,
} from "./source-identity";
import {
	type AutoResult,
	type MappingResult,
	type UpstreamTarget,
} from "./types";

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
	idsmoe: [] as Array<{
		provider: Provider;
		source: SourceIdentity;
		target: UpstreamTarget;
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
}));

vi.mock("./manual.store", () => ({
	getManualFacts: vi.fn(async (provider: Provider, source: SourceIdentity | AniListId) =>
		storeRecords.manual.find(
			(record) =>
				record.provider === provider &&
				recordSourceKey(record) === inputSourceKey(source),
		)?.facts ?? null,
	),
	listSourceManualFacts: vi.fn(async (provider: Provider) =>
		storeRecords.manual
			.filter((record) => record.provider === provider)
			.map((record) => ({
				source: recordSource(record),
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
	getAutoResult: vi.fn(async (provider: Provider, source: SourceIdentity | AniListId) =>
		storeRecords.auto.find(
			(record) =>
				record.provider === provider &&
				recordSourceKey(record) === inputSourceKey(source),
		)?.result ?? null,
	),
	listSourceAutoResults: vi.fn(async (provider: Provider) =>
		storeRecords.auto
			.filter((record) => record.provider === provider)
			.map((record) => ({
				source: recordSource(record),
				result: record.result,
			})),
	),
}));

vi.mock("./idsmoe.store", () => ({
	getCachedIdsMoeTarget: vi.fn(async (provider: Provider, source: SourceIdentity) =>
		storeRecords.idsmoe.find(
			(record) =>
				record.provider === provider &&
				recordSourceKey(record) === inputSourceKey(source),
		)?.target ?? null,
	),
	resolveIdsMoeTarget: vi.fn(async (provider: Provider, source: SourceIdentity) =>
		storeRecords.idsmoe.find(
			(record) =>
				record.provider === provider &&
				recordSourceKey(record) === inputSourceKey(source),
		)?.target ?? null,
	),
}));

vi.mock("./upstream.store", () => ({
	getUpstreamTargets: vi.fn(async (provider: Provider, source: SourceIdentity | AniListId) =>
		(storeRecords.upstream.find(
			(record) => recordSourceKey(record) === inputSourceKey(source),
		)
			?.targets ?? []
		).filter((target) => target.provider === provider),
	),
	getUniqueAniListIdForSource: vi.fn(async (source: SourceIdentity) =>
		storeRecords.crosswalks.find(
			(record) => recordSourceKey(record) === inputSourceKey(source),
		)?.anilistId ?? null,
	),
	listSourceUpstreamMappings: vi.fn(async () =>
		storeRecords.upstream.map((record) => ({
			source: recordSource(record),
			targets: record.targets,
		})),
	),
}));

const aid = parseAniListId;
const mal = parseMyAnimeListId;
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

function anilistSource(id: AniListId): SourceIdentity {
	return { source: "anilist", id };
}

function inputSourceKey(source: SourceIdentity | AniListId): string {
	return sourceIdentityKey(
		typeof source === "number" ? anilistSource(source) : source,
	);
}

function recordSourceKey(record: {
	anilistId?: AniListId;
	source?: SourceIdentity;
}): string {
	return sourceIdentityKey(recordSource(record));
}

function recordSource(record: {
	anilistId?: AniListId;
	source?: SourceIdentity;
}): SourceIdentity {
	if (record.source) return record.source;
	if (record.anilistId !== undefined) return anilistSource(record.anilistId);
	throw new Error("Test record needs source or anilistId.");
}

function resetRecords(): void {
	storeRecords.manual = [];
	storeRecords.auto = [];
	storeRecords.idsmoe = [];
	storeRecords.upstream = [];
	storeRecords.crosswalks = [];
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
				name: "multiple Sonarr seasons for the same TVDB show collapse to one upstream mapping",
				provider: "sonarr",
				upstream: [
					{ provider: "sonarr", providerId: tvdb(81_797), season: 0 },
					{ provider: "sonarr", providerId: tvdb(81_797), season: 1 },
					{ provider: "sonarr", providerId: tvdb(81_797), season: 2 },
				],
				expected: {
					kind: "mapped",
					source: "upstream",
					providerId: tvdb(81_797),
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
				name: "auto can choose one ambiguous upstream target",
				provider: "sonarr",
				upstream: [
					{ provider: "sonarr", providerId: tvdb(262_094), season: 0 },
					{ provider: "sonarr", providerId: tvdb(310_718), season: 1 },
				],
				auto: { kind: "mapped", providerId: tvdb(310_718) },
				expected: {
					kind: "mapped",
					source: "auto",
					providerId: tvdb(310_718),
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

	it("computes linked AniList IDs from active mapping results", async () => {
		storeRecords.upstream = [
			{
				anilistId: aid(1),
				targets: [{ provider: "radarr", providerId: tmdb(50) }],
			},
			{
				anilistId: aid(5),
				targets: [{ provider: "radarr", providerId: tmdb(50) }],
			},
			{
				anilistId: aid(6),
				targets: [
					{ provider: "radarr", providerId: tmdb(50) },
					{ provider: "radarr", providerId: tmdb(51) },
				],
			},
		];
		storeRecords.auto = [
			{
				provider: "radarr",
				anilistId: aid(2),
				result: { kind: "mapped", providerId: tmdb(50) },
			},
			{
				provider: "radarr",
				anilistId: aid(4),
				result: { kind: "mapped", providerId: tmdb(50) },
			},
		];
		storeRecords.manual = [
			{
				provider: "radarr",
				anilistId: aid(3),
				facts: { mapping: { providerId: tmdb(50) } },
			},
			{
				provider: "radarr",
				anilistId: aid(4),
				facts: { ignored: true },
			},
			{
				provider: "radarr",
				anilistId: aid(5),
				facts: { mapping: { providerId: tmdb(60) } },
			},
		];

		await expect(
			service().getLinkedAniListIds("radarr", tmdb(50)),
		).resolves.toEqual([aid(1), aid(2), aid(3)]);
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

	it("includes MAL source mappings with unique AniList crosswalks in linked ID scans", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		storeRecords.crosswalks = [{ source, anilistId: aid(10) }];
		storeRecords.manual = [
			{
				provider: "sonarr",
				source,
				facts: { mapping: { providerId: tvdb(78_874) } },
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
		expect(resolver).toHaveBeenCalledWith("sonarr", anilistSource(anilistId), [], {
			title: "Kagurabachi",
		});
	});

	it("runs automatic resolver for ambiguous upstream targets", async () => {
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
		const resolver = vi.fn(async () => {
			replaceAuto("sonarr", anilistId, {
				kind: "mapped",
				providerId: tvdb(310_718),
				matchedTitle: "Magi: Sinbad no Bouken",
			});
		});

		await expect(
			new MappingService(resolver).resolveMapping("sonarr", anilistId, {
				title: "Magi: Sinbad no Bouken",
			}),
		).resolves.toEqual({
			kind: "mapped",
			source: "auto",
			providerId: tvdb(310_718),
			matchedTitle: "Magi: Sinbad no Bouken",
		});
		expect(resolver).toHaveBeenCalledWith("sonarr", anilistSource(anilistId), [], {
			title: "Magi: Sinbad no Bouken",
		});
	});

	it("does not retry ambiguous upstream targets after a cached auto miss", async () => {
		const anilistId = aid(23);
		const targets = [
			{ provider: "sonarr" as const, providerId: tvdb(262_094), season: 0 },
			{ provider: "sonarr" as const, providerId: tvdb(310_718), season: 1 },
		];
		storeRecords.upstream = [{ anilistId, targets }];
		replaceAuto("sonarr", anilistId, { kind: "unmapped" });
		const resolver = vi.fn();

		await expect(
			new MappingService(resolver).resolveMapping("sonarr", anilistId),
		).resolves.toEqual({
			kind: "ambiguous",
			targets,
		});
		expect(resolver).not.toHaveBeenCalled();
	});

	it("force retries ambiguous upstream targets after a cached auto miss", async () => {
		const anilistId = aid(24);
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
		const resolver = vi.fn(async () => {
			replaceAuto("sonarr", anilistId, {
				kind: "mapped",
				providerId: tvdb(310_718),
				matchedTitle: "Magi: Sinbad no Bouken",
			});
		});

		await expect(
			new MappingService(resolver).resolveMapping("sonarr", anilistId, {
				forceRetry: true,
				title: "Magi: Sinbad no Bouken",
			}),
		).resolves.toEqual({
			kind: "mapped",
			source: "auto",
			providerId: tvdb(310_718),
			matchedTitle: "Magi: Sinbad no Bouken",
		});
		expect(resolver).toHaveBeenCalledWith("sonarr", anilistSource(anilistId), [], {
			title: "Magi: Sinbad no Bouken",
		});
	});

	it("resolves MAL direct upstream before auto", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		storeRecords.upstream = [
			{
				source,
				targets: [{ provider: "sonarr", providerId: tvdb(78_874), season: 1 }],
			},
		];
		storeRecords.auto = [
			{
				provider: "sonarr",
				source,
				result: { kind: "mapped", providerId: tvdb(999_999) },
			},
		];

		await expect(service().getMapping("sonarr", source)).resolves.toEqual({
			kind: "mapped",
			source: "upstream",
			providerId: tvdb(78_874),
			season: 1,
		});
	});

	it("lets manual MAL mappings beat upstream", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		storeRecords.manual = [
			{
				provider: "sonarr",
				source,
				facts: { mapping: { providerId: tvdb(111_111), season: 1 } },
			},
		];
		storeRecords.upstream = [
			{
				source,
				targets: [{ provider: "sonarr", providerId: tvdb(78_874), season: 1 }],
			},
		];

		await expect(service().getMapping("sonarr", source)).resolves.toEqual({
			kind: "mapped",
			source: "manual",
			providerId: tvdb(111_111),
			season: 1,
		});
	});

	it("uses ids.moe below upstream and above auto", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		storeRecords.upstream = [
			{
				source,
				targets: [{ provider: "radarr", providerId: tmdb(100) }],
			},
		];
		storeRecords.idsmoe = [
			{
				provider: "radarr",
				source,
				target: { provider: "radarr", providerId: tmdb(200) },
			},
		];
		storeRecords.auto = [
			{
				provider: "radarr",
				source,
				result: { kind: "mapped", providerId: tmdb(300) },
			},
		];

		await expect(service().getMapping("radarr", source)).resolves.toEqual({
			kind: "mapped",
			source: "upstream",
			providerId: tmdb(100),
		});

		storeRecords.upstream = [];

		await expect(service().getMapping("radarr", source)).resolves.toEqual({
			kind: "mapped",
			source: "idsmoe",
			providerId: tmdb(200),
		});
	});

	it("lets manual mappings beat ids.moe", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		storeRecords.manual = [
			{
				provider: "radarr",
				source,
				facts: { mapping: { providerId: tmdb(100) } },
			},
		];
		storeRecords.idsmoe = [
			{
				provider: "radarr",
				source,
				target: { provider: "radarr", providerId: tmdb(200) },
			},
		];

		await expect(service().getMapping("radarr", source)).resolves.toEqual({
			kind: "mapped",
			source: "manual",
			providerId: tmdb(100),
		});
	});

	it("treats rejected ids.moe targets as unmapped", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		storeRecords.manual = [
			{
				provider: "radarr",
				source,
				facts: { rejectedProviderIds: [tmdb(200)] },
			},
		];
		storeRecords.idsmoe = [
			{
				provider: "radarr",
				source,
				target: { provider: "radarr", providerId: tmdb(200) },
			},
		];

		await expect(service().getMapping("radarr", source)).resolves.toEqual({
			kind: "unmapped",
			hadResolveAttempt: true,
			rejectedProviderIds: [tmdb(200)],
		});
	});

	it("keeps ambiguous MAL upstream targets ambiguous", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		const targets = [
			{ provider: "sonarr" as const, providerId: tvdb(78_874), season: 1 },
			{ provider: "sonarr" as const, providerId: tvdb(999_999), season: 1 },
		];
		storeRecords.upstream = [{ source, targets }];

		await expect(service().getMapping("sonarr", source)).resolves.toEqual({
			kind: "ambiguous",
			targets,
		});
	});

	it("does not force retry mapped auto results", async () => {
		const anilistId = aid(21);
		const resolver = vi.fn();
		replaceAuto("radarr", anilistId, {
			kind: "mapped",
			providerId: tmdb(300),
		});

		await expect(
			new MappingService(resolver).resolveMapping("radarr", anilistId, {
				forceRetry: true,
			}),
		).resolves.toEqual({
			kind: "mapped",
			source: "auto",
			providerId: tmdb(300),
		});
		expect(resolver).not.toHaveBeenCalled();
	});
});
