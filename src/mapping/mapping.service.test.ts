/** Tests for mapping precedence and linked AniList ID discovery. */
// src/mapping/mapping.service.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type AniListId, parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import { getAutoResult } from "./auto.store";
import { getManualFacts, type ManualFacts } from "./manual.store";
import { MappingService } from "./mapping.service";
import {
	collectEffectiveMappingRecords,
	type EffectiveMappingRecord,
} from "./mapping-facts";
import type { AutoResult, MappingResult, UpstreamTarget } from "./types";
import { getSourceUpstreamMapping } from "./upstream.store";

vi.mock("./manual.store", () => ({
	getManualFacts: vi.fn(),
	listAniListManualFacts: vi.fn(),
	clearIgnored: vi.fn(),
	clearManualMapping: vi.fn(),
	clearRejectedAutoCandidate: vi.fn(),
	rejectAutoCandidate: vi.fn(),
	setIgnored: vi.fn(),
	setManualMapping: vi.fn(),
}));

vi.mock("./auto.store", () => ({
	getAutoResult: vi.fn(),
	listAniListAutoResults: vi.fn(),
}));

vi.mock("./upstream.store", () => ({
	getSourceUpstreamMapping: vi.fn(),
	listAniListUpstreamMappings: vi.fn(),
}));

vi.mock("./mapping-facts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./mapping-facts")>();
	return {
		...actual,
		collectEffectiveMappingRecords: vi.fn(),
	};
});

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;
const anilistSource = (id: AniListId) => ({ source: "anilist", id }) as const;

const getManualFactsMock = vi.mocked(getManualFacts);
const getAutoResultMock = vi.mocked(getAutoResult);
const getSourceUpstreamMappingMock = vi.mocked(getSourceUpstreamMapping);
const collectEffectiveMappingRecordsMock = vi.mocked(
	collectEffectiveMappingRecords,
);

const service = () => new MappingService(vi.fn());

function mappedRecord(
	provider: Provider,
	anilistId: AniListId,
	result: Extract<MappingResult, { kind: "mapped" }>,
): EffectiveMappingRecord {
	return { provider, anilistId, result };
}

describe("MappingService", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		getManualFactsMock.mockResolvedValue(null);
		getAutoResultMock.mockResolvedValue(null);
		getSourceUpstreamMappingMock.mockImplementation(
			async (_provider, source) => ({
				anilistId: source.source === "anilist" ? source.id : null,
				targets: [],
			}),
		);
		collectEffectiveMappingRecordsMock.mockResolvedValue([]);
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
				name: "ambiguity beats auto",
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
			const anilistId = aid(index + 1);
			getSourceUpstreamMappingMock.mockResolvedValueOnce({
				anilistId,
				targets: testCase.upstream ?? [],
			});
			getManualFactsMock.mockResolvedValueOnce(testCase.manual ?? null);
			getAutoResultMock.mockResolvedValueOnce(testCase.auto ?? null);

			await expect(
				service().getMapping(testCase.provider, anilistSource(anilistId)),
				testCase.name,
			).resolves.toEqual(testCase.expected);
		}
	});

	it("uses a direct MAL target without running automatic matching", async () => {
		const source = { source: "mal", id: mal(59_571) } as const;
		getSourceUpstreamMappingMock.mockResolvedValueOnce({
			anilistId: null,
			targets: [{ provider: "radarr", providerId: tmdb(1_333_100) }],
		});
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

	it("reads linked MAL manual facts through the canonical AniList identity", async () => {
		const firstAniListId = aid(21);
		const secondAniListId = aid(22);
		const source = { source: "mal", id: mal(5114) } as const;
		getSourceUpstreamMappingMock
			.mockResolvedValueOnce({ anilistId: firstAniListId, targets: [] })
			.mockResolvedValueOnce({ anilistId: secondAniListId, targets: [] });
		getManualFactsMock
			.mockResolvedValueOnce({ mapping: { providerId: tvdb(300) } })
			.mockResolvedValueOnce({ mapping: { providerId: tvdb(500) } });

		await expect(service().getMapping("sonarr", source)).resolves.toEqual({
			kind: "mapped",
			source: "manual",
			providerId: tvdb(300),
		});
		await expect(service().getMapping("sonarr", source)).resolves.toEqual({
			kind: "mapped",
			source: "manual",
			providerId: tvdb(500),
		});

		expect(getManualFactsMock).toHaveBeenNthCalledWith(
			1,
			"sonarr",
			source,
			firstAniListId,
		);
		expect(getManualFactsMock).toHaveBeenNthCalledWith(
			2,
			"sonarr",
			source,
			secondAniListId,
		);
	});

	it("uses a source-native manual decision for an unlinked MAL entry", async () => {
		const source = { source: "mal", id: mal(63_816) } as const;
		getManualFactsMock.mockResolvedValueOnce({
			mapping: { providerId: tvdb(424_536) },
		});

		await expect(service().getMapping("sonarr", source)).resolves.toEqual({
			kind: "mapped",
			source: "manual",
			providerId: tvdb(424_536),
		});
		expect(getManualFactsMock).toHaveBeenCalledWith(
			"sonarr",
			source,
			undefined,
		);
	});

	it("resolves and reuses an automatic mapping for a MAL-only source", async () => {
		const source = { source: "mal", id: mal(59_999) } as const;
		getAutoResultMock.mockResolvedValueOnce(null).mockResolvedValueOnce({
			kind: "mapped",
			providerId: tvdb(999),
			matchedTitle: "MAL Page Title",
		});
		const resolver = vi.fn(async () => true);

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
		expect(getSourceUpstreamMappingMock).toHaveBeenCalledOnce();
	});

	it("uses the MAL identity and linked AniList metadata for crosswalked resolution", async () => {
		const source = { source: "mal", id: mal(59_999) } as const;
		const anilistId = aid(211_496);
		const mappedAuto: AutoResult = {
			kind: "mapped",
			providerId: tvdb(1000),
		};
		getSourceUpstreamMappingMock.mockResolvedValue({ anilistId, targets: [] });
		getAutoResultMock
			.mockResolvedValueOnce({ kind: "unmapped" })
			.mockResolvedValueOnce({ kind: "unmapped" })
			.mockResolvedValueOnce(mappedAuto)
			.mockResolvedValueOnce(mappedAuto);
		const resolver = vi.fn(async () => true);
		const mappingService = new MappingService(resolver);

		await expect(mappingService.getMapping("sonarr", source)).resolves.toEqual({
			kind: "unmapped",
			hadResolveAttempt: true,
		});
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
		collectEffectiveMappingRecordsMock.mockResolvedValue([
			mappedRecord("radarr", aid(30), {
				kind: "mapped",
				source: "manual",
				providerId: tmdb(100),
			}),
			mappedRecord("radarr", aid(10), {
				kind: "mapped",
				source: "upstream",
				providerId: tmdb(100),
			}),
			mappedRecord("radarr", aid(20), {
				kind: "mapped",
				source: "auto",
				providerId: tmdb(100),
			}),
			{
				provider: "radarr",
				anilistId: aid(40),
				result: { kind: "ignored" },
			},
			mappedRecord("radarr", aid(50), {
				kind: "mapped",
				source: "manual",
				providerId: tmdb(200),
			}),
		]);

		const linked = await service().getLinkedAniListIdsByProviderIds("radarr", [
			tmdb(100),
			tmdb(200),
			tmdb(100),
		]);

		expect([...linked.entries()]).toEqual([
			[tmdb(100), [aid(10), aid(20), aid(30)]],
			[tmdb(200), [aid(50)]],
		]);
		expect(collectEffectiveMappingRecordsMock).toHaveBeenCalledOnce();
		expect(collectEffectiveMappingRecordsMock).toHaveBeenCalledWith("radarr");
	});

	it("returns each linked AniList ID once when effective records repeat", async () => {
		const record = mappedRecord("sonarr", aid(10), {
			kind: "mapped",
			source: "upstream",
			providerId: tvdb(78_874),
		});
		collectEffectiveMappingRecordsMock.mockResolvedValue([record, record]);

		await expect(
			service().getLinkedAniListIds("sonarr", tvdb(78_874)),
		).resolves.toEqual([aid(10)]);
	});

	it("retries cached unmapped auto results only when forced", async () => {
		const anilistId = aid(20);
		const source = anilistSource(anilistId);
		getAutoResultMock
			.mockResolvedValueOnce({ kind: "unmapped" })
			.mockResolvedValueOnce({ kind: "unmapped" })
			.mockResolvedValueOnce({
				kind: "mapped",
				providerId: tvdb(200),
				matchedTitle: "Kagurabachi",
			});
		const resolver = vi.fn(async () => true);
		const mappingService = new MappingService(resolver);

		await expect(
			mappingService.resolveMapping("sonarr", source),
		).resolves.toEqual({
			kind: "unmapped",
			hadResolveAttempt: true,
		});
		expect(resolver).not.toHaveBeenCalled();

		await expect(
			mappingService.resolveMapping("sonarr", source, {
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
			identity: source,
			anilistId,
			rejectedProviderIds: [],
			title: "Kagurabachi",
		});
	});

	it("never resolves ambiguous upstream targets, including forced retries", async () => {
		const anilistId = aid(22);
		const source = anilistSource(anilistId);
		const targets: UpstreamTarget[] = [
			{ provider: "sonarr", providerId: tvdb(262_094), season: 0 },
			{ provider: "sonarr", providerId: tvdb(310_718), season: 1 },
		];
		getSourceUpstreamMappingMock.mockResolvedValueOnce({ anilistId, targets });
		getAutoResultMock.mockResolvedValueOnce({ kind: "unmapped" });
		const resolver = vi.fn();

		await expect(
			new MappingService(resolver).resolveMapping("sonarr", source, {
				forceRetry: true,
				title: "Magi: Sinbad no Bouken",
			}),
		).resolves.toEqual({
			kind: "ambiguous",
			targets,
		});
		expect(resolver).not.toHaveBeenCalled();
	});
});
