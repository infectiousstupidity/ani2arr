/** Tests for mapping precedence and linked AniList ID discovery. */
// src/mapping/mapping.service.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId, type AniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import {
	sourceIdentityKey,
	storageIdentity,
	type SourceIdentity,
} from "./source-identity";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import type { ManualFacts } from "./manual.store";
import { MappingService } from "./mapping.service";
import { getSourceUpstreamMapping } from "./upstream.store";
import {
	type AutoResult,
	type MappingResult,
	type UpstreamTarget,
} from "./types";

const storeRecords = vi.hoisted(() => ({
	manual: [] as Array<{
		provider: Provider;
		identity: SourceIdentity;
		facts: ManualFacts;
	}>,
	auto: [] as Array<{
		provider: Provider;
		identity: SourceIdentity;
		result: AutoResult;
	}>,
	upstream: [] as Array<{
		anilistId: AniListId;
		targets: UpstreamTarget[];
	}>,
	sourceFacts: [] as Array<{
		source: SourceIdentity;
		targets: UpstreamTarget[];
	}>,
	aliases: new Map<string, AniListId>(),
}));

vi.mock("./manual.store", () => ({
	getManualFacts: vi.fn(
		async (
			provider: Provider,
			identity: SourceIdentity,
			anilistId?: AniListId,
		) =>
			storeRecords.manual.find(
				(record) =>
					record.provider === provider &&
					sourceIdentityKey(record.identity) ===
						sourceIdentityKey(storageIdentity(identity, anilistId)),
			)?.facts ?? null,
	),
	listAniListManualFacts: vi.fn(async (provider: Provider) =>
		storeRecords.manual
			.filter(
				(record) =>
					record.provider === provider && record.identity.source === "anilist",
			)
			.map((record) => ({
				anilistId: record.identity.id,
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
	getAutoResult: vi.fn(
		async (
			provider: Provider,
			identity: SourceIdentity,
			anilistId?: AniListId,
		) =>
			storeRecords.auto.find(
				(record) =>
					record.provider === provider &&
					sourceIdentityKey(record.identity) ===
						sourceIdentityKey(storageIdentity(identity, anilistId)),
			)?.result ?? null,
	),
	listAniListAutoResults: vi.fn(async (provider: Provider) =>
		storeRecords.auto.flatMap((record) =>
			record.provider === provider && record.identity.source === "anilist"
				? [{ anilistId: record.identity.id, result: record.result }]
				: [],
		),
	),
}));

vi.mock("./upstream.store", () => ({
	getSourceUpstreamMapping: vi.fn(
		async (provider: Provider, source: SourceIdentity) => {
			const anilistId =
				source.source === "anilist"
					? source.id
					: (storeRecords.aliases.get(sourceIdentityKey(source)) ?? null);
			const directTargets = (
				(source.source === "anilist"
					? storeRecords.upstream.find(
							(record) => record.anilistId === source.id,
						)?.targets
					: storeRecords.sourceFacts.find(
							(record) =>
								sourceIdentityKey(record.source) === sourceIdentityKey(source),
						)?.targets) ?? []
			).filter((target) => target.provider === provider);
			const fallbackTargets =
				directTargets.length > 0 || anilistId === null
					? directTargets
					: (
							storeRecords.upstream.find(
								(record) => record.anilistId === anilistId,
							)?.targets ?? []
						).filter((target) => target.provider === provider);

			return { anilistId, targets: fallbackTargets };
		},
	),
	listAniListUpstreamMappings: vi.fn(async () => storeRecords.upstream),
}));

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;
const anilistSource = (id: AniListId) => ({ source: "anilist", id }) as const;

const service = () => new MappingService(vi.fn());
const replaceAuto = (
	provider: Provider,
	identity: SourceIdentity,
	result: AutoResult,
): void => {
	storeRecords.auto = storeRecords.auto.filter(
		(record) =>
			record.provider !== provider ||
			sourceIdentityKey(record.identity) !== sourceIdentityKey(identity),
	);
	storeRecords.auto.push({ provider, identity, result });
};

function resetRecords(): void {
	storeRecords.manual = [];
	storeRecords.auto = [];
	storeRecords.upstream = [];
	storeRecords.sourceFacts = [];
	storeRecords.aliases = new Map();
}

describe("MappingService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
					identity: anilistSource(anilistId),
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
					identity: anilistSource(anilistId),
					result: testCase.auto,
				});
			}

			await expect(
				service().getMapping(provider, anilistSource(anilistId)),
			).resolves.toEqual(testCase.expected);
		}
	});

	it("uses a direct MAL target without running automatic matching", async () => {
		const source = { source: "mal", id: mal(59_571) } as const;
		storeRecords.sourceFacts = [
			{
				source,
				targets: [{ provider: "radarr", providerId: tmdb(1_333_100) }],
			},
		];
		const resolver = vi.fn();

		await expect(
			new MappingService(resolver).resolveMapping("radarr", source, {
				forceRetry: true,
				title: "Kaguya-sama: Love Is War - The First Kiss That Never Ends",
			}),
		).resolves.toEqual({
			kind: "mapped",
			source: "upstream",
			providerId: tmdb(1_333_100),
		});
		expect(resolver).not.toHaveBeenCalled();
	});

	it("reads linked MAL manual facts only through the canonical AniList identity", async () => {
		const firstAniListId = aid(21);
		const secondAniListId = aid(22);
		const source = { source: "mal", id: mal(5114) } as const;
		storeRecords.aliases.set(sourceIdentityKey(source), firstAniListId);
		storeRecords.manual = [
			{
				provider: "sonarr",
				identity: anilistSource(firstAniListId),
				facts: { mapping: { providerId: tvdb(300) } },
			},
			{
				provider: "sonarr",
				identity: anilistSource(secondAniListId),
				facts: { mapping: { providerId: tvdb(500) } },
			},
			{
				provider: "sonarr",
				identity: source,
				facts: { mapping: { providerId: tvdb(400) } },
			},
		];

		await expect(service().getMapping("sonarr", source)).resolves.toEqual({
			kind: "mapped",
			source: "manual",
			providerId: tvdb(300),
		});

		storeRecords.aliases.set(sourceIdentityKey(source), secondAniListId);
		await expect(
			service().getMapping("sonarr", source),
		).resolves.toEqual({
			kind: "mapped",
			source: "manual",
			providerId: tvdb(500),
		});
	});

	it("uses a source-native manual decision for an unlinked MAL entry", async () => {
		const source = { source: "mal", id: mal(63_816) } as const;
		storeRecords.manual = [
			{
				provider: "sonarr",
				identity: source,
				facts: { mapping: { providerId: tvdb(424_536) } },
			},
		];

		await expect(service().getMapping("sonarr", source)).resolves.toEqual({
			kind: "mapped",
			source: "manual",
			providerId: tvdb(424_536),
		});
	});

	it("resolves and reuses an automatic mapping for a MAL-only source", async () => {
		const source = { source: "mal", id: mal(59_999) } as const;
		const resolver = vi.fn(async () => {
			replaceAuto("sonarr", source, {
				kind: "mapped",
				providerId: tvdb(999),
				matchedTitle: "MAL Page Title",
			});
			return true;
		});

		await expect(
			new MappingService(resolver).resolveMapping("sonarr", source, {
				forceRetry: true,
				title: "MAL Page Title",
			}),
		).resolves.toEqual({
			kind: "mapped",
			source: "auto",
			providerId: tvdb(999),
			matchedTitle: "MAL Page Title",
		});
		expect(resolver).toHaveBeenCalledWith({
			provider: "sonarr",
			identity: source,
			anilistId: null,
			rejectedProviderIds: [],
			title: "MAL Page Title",
		});
		expect(getSourceUpstreamMapping).toHaveBeenCalledOnce();
	});

	it("uses the MAL identity and linked AniList metadata for crosswalked resolution", async () => {
		const source = { source: "mal", id: mal(59_999) } as const;
		const anilistId = aid(211_496);
		storeRecords.aliases.set(sourceIdentityKey(source), anilistId);
		replaceAuto("sonarr", anilistSource(anilistId), { kind: "unmapped" });
		const resolver = vi.fn(async () => {
			replaceAuto("sonarr", anilistSource(anilistId), {
				kind: "mapped",
				providerId: tvdb(1000),
			});
			return true;
		});
		const mappingService = new MappingService(resolver);
		await expect(
			mappingService.getMapping("sonarr", source),
		).resolves.toEqual({ kind: "unmapped", hadResolveAttempt: true });

		await expect(
			mappingService.resolveMapping("sonarr", source, {
				forceRetry: true,
				title: "Crosswalked MAL Page Title",
			}),
		).resolves.toEqual({
			kind: "mapped",
			source: "auto",
			providerId: tvdb(1000),
		});
		expect(resolver).toHaveBeenCalledWith({
			provider: "sonarr",
			identity: source,
			anilistId,
			rejectedProviderIds: [],
			title: "Crosswalked MAL Page Title",
		});
		await expect(
			mappingService.getMapping("sonarr", anilistSource(anilistId)),
		).resolves.toEqual({
			kind: "mapped",
			source: "auto",
			providerId: tvdb(1000),
		});
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
				identity: anilistSource(aid(20)),
				result: { kind: "mapped", providerId: tmdb(100) },
			},
			{
				provider: "radarr",
				identity: anilistSource(aid(30)),
				result: { kind: "mapped", providerId: tmdb(200) },
			},
			{
				provider: "radarr",
				identity: anilistSource(aid(40)),
				result: { kind: "mapped", providerId: tmdb(100) },
			},
		];
		storeRecords.manual = [
			{
				provider: "radarr",
				identity: anilistSource(aid(30)),
				facts: { mapping: { providerId: tmdb(100) } },
			},
			{
				provider: "radarr",
				identity: anilistSource(aid(40)),
				facts: { ignored: true },
			},
			{
				provider: "radarr",
				identity: anilistSource(aid(50)),
				facts: { mapping: { providerId: tmdb(200) } },
			},
		];

		const linked = await service().getLinkedAniListIdsByProviderIds("radarr", [
			tmdb(100),
			tmdb(200),
			tmdb(100),
		]);

		expect([...linked.entries()]).toEqual([
			[tmdb(100), [aid(10), aid(20), aid(30)]],
			[tmdb(200), [aid(50)]],
		]);
	});

	it("returns each linked AniList ID once when mapping facts overlap", async () => {
		storeRecords.manual = [
			{
				provider: "sonarr",
				identity: anilistSource(aid(10)),
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
			replaceAuto("sonarr", anilistSource(anilistId), {
				kind: "mapped",
				providerId: tvdb(200),
				matchedTitle: "Kagurabachi",
			});
			return true;
		});
		replaceAuto("sonarr", anilistSource(anilistId), { kind: "unmapped" });
		const mappingService = new MappingService(resolver);

		await expect(
			mappingService.resolveMapping("sonarr", anilistSource(anilistId)),
		).resolves.toEqual({
			kind: "unmapped",
			hadResolveAttempt: true,
		});
		expect(resolver).not.toHaveBeenCalled();

		await expect(
			mappingService.resolveMapping("sonarr", anilistSource(anilistId), {
				forceRetry: true,
				title: "Kagurabachi",
			}),
		).resolves.toEqual({
			kind: "mapped",
			source: "auto",
			providerId: tvdb(200),
			matchedTitle: "Kagurabachi",
		});
		expect(resolver).toHaveBeenCalledWith({
			provider: "sonarr",
			identity: anilistSource(anilistId),
			anilistId,
			rejectedProviderIds: [],
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
		replaceAuto("sonarr", anilistSource(anilistId), { kind: "unmapped" });
		const resolver = vi.fn();

		await expect(
			new MappingService(resolver).resolveMapping(
				"sonarr",
				anilistSource(anilistId),
				{
					forceRetry: true,
					title: "Magi: Sinbad no Bouken",
				},
			),
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
