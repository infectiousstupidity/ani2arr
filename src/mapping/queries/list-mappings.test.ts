/** Tests for the mapping review projection and paging logic. */
// src/mapping/queries/list-mappings.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId, type AniListId } from "@/anilist";
import {
	parseTmdbId,
	parseTvdbId,
	type RadarrMovieSnapshot,
	type TmdbId,
	type TvdbId,
} from "@/providers";
import type { SonarrSeriesSnapshot } from "@/providers/sonarr/types";
import type { AutoMappingRecord } from "@/mapping/auto-mapping/types";
import { listMappings, type ListMappingsDeps } from "./list-mappings";

const aid = parseAniListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

const getRows = (result: Awaited<ReturnType<typeof listMappings>>) =>
	result.groups.flatMap((group) => group.rows);

type TestProviderMapping =
	| { provider: "sonarr"; anilistId: AniListId; providerId: TvdbId }
	| { provider: "radarr"; anilistId: AniListId; providerId: TmdbId };

const createAutoMappingStore = (
	entries: Array<
		AutoMappingRecord & { anilistId: AniListId; provider: "sonarr" | "radarr" }
	> = [],
) => ({
	list: async (provider?: "sonarr" | "radarr") =>
		provider ? entries.filter((entry) => entry.provider === provider) : entries,
});

const createAnibridgeStore = (
	providerMappings: TestProviderMapping[] = [],
): ListMappingsDeps["anibridgeMappingStore"] => ({
	listAllProviderPairs: () => providerMappings,
});

interface CreateDepsInput {
	manualMappings?: ReturnType<ListMappingsDeps["manualMappingService"]["list"]>;
	ignores?: ReturnType<ListMappingsDeps["manualMappingService"]["listIgnores"]>;
	rejected?: ReturnType<
		ListMappingsDeps["manualMappingService"]["listRejectedCandidates"]
	>;
	providerMappings?: TestProviderMapping[];
	series?: SonarrSeriesSnapshot[];
	movies?: RadarrMovieSnapshot[];
	autoMappings?: Array<
		AutoMappingRecord & {
			anilistId: AniListId;
			provider: "sonarr" | "radarr";
		}
	>;
}

const createDeps = (input: CreateDepsInput = {}): ListMappingsDeps => ({
	manualMappingService: {
		listIgnores: () => input.ignores ?? [],
		listRejectedCandidates: () => input.rejected ?? [],
		list: () => input.manualMappings ?? [],
	},
	anibridgeMappingStore: createAnibridgeStore(input.providerMappings ?? []),
	sonarrLibrary: {
		getLeanSeriesList: async () => input.series ?? [],
	},
	radarrLibrary: {
		getLeanMovieList: async () => input.movies ?? [],
	},
	autoMappingStore: createAutoMappingStore(input.autoMappings ?? []),
});

describe("listMappings", () => {
	it("collapses matching manual mappings into exact upstream truth and preserves unresolved entries", async () => {
		const result = await listMappings(
			{ limit: 10 },
			createDeps({
				manualMappings: [
					{
						anilistId: aid(1),
						provider: "sonarr",
						providerId: tvdb(222),
						updatedAt: 100,
					},
				],
				providerMappings: [
					{ provider: "sonarr", anilistId: aid(1), providerId: tvdb(222) },
				],
				autoMappings: [
					{
						anilistId: aid(1),
						provider: "sonarr",
						state: "mapped",
						providerId: tvdb(111),
						acceptedEvidence: {
							source: "auto",
							reason: "fuzzy-match",
						},
						updatedAt: 50,
					},
					{
						anilistId: aid(2),
						provider: "radarr",
						state: "unresolved",
						updatedAt: 75,
					},
				],
			}),
		);

		expect(result.total).toBe(2);
		const rows = getRows(result);
		const upstreamRow = rows.find((entry) => entry.anilistId === 1);
		expect(upstreamRow).toMatchObject({
			provider: "sonarr",
			mappingRowStatus: "can-add",
			isInLibrary: false,
			providerId: tvdb(222),
			mappingSource: "upstream",
			mappingReason: "exact-upstream",
			resolverOutcome: "mapped",
		});
		expect(upstreamRow?.mappingEntryKind).toBe("upstream");

		const unresolvedRow = rows.find((entry) => entry.anilistId === 2);
		expect(unresolvedRow).toMatchObject({
			provider: "radarr",
			mappingRowStatus: "unmapped",
			isInLibrary: null,
			resolverOutcome: "unresolved",
		});
		expect(unresolvedRow?.mappingEntryKind).toBe("unmapped");
	});

	it("keeps manual mappings effective when they disagree with exact upstream truth", async () => {
		const result = await listMappings(
			{ limit: 10 },
			createDeps({
				manualMappings: [
					{
						anilistId: aid(1),
						provider: "sonarr",
						providerId: tvdb(777),
						updatedAt: 20,
					},
				],
				providerMappings: [
					{ provider: "sonarr", anilistId: aid(1), providerId: tvdb(555) },
				],
			}),
		);

		const rows = getRows(result);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			anilistId: aid(1),
			provider: "sonarr",
			providerId: tvdb(777),
			mappingRowStatus: "needs-review",
			isInLibrary: false,
			mappingSource: "manual",
			mappingReason: "manual-override",
			resolverOutcome: "mapped",
			reviewSummary: {
				count: 1,
				primaryReason: "manual-upstream-disagreement",
				reasons: ["manual-upstream-disagreement"],
			},
			reviewItems: [
				expect.objectContaining({
					reason: "manual-upstream-disagreement",
					current: expect.objectContaining({
						mappingEntryKind: "manual",
						providerId: tvdb(777),
						acceptedReason: "manual-override",
					}),
					proposed: expect.objectContaining({
						mappingEntryKind: "upstream",
						providerId: tvdb(555),
						acceptedReason: "exact-upstream",
					}),
				}),
			],
		});
		expect(rows[0]?.mappingEntryKind).toBe("manual");
	});

	it("projects manual mappings without upstream conflicts when no exact upstream exists", async () => {
		const result = await listMappings(
			{ limit: 10 },
			createDeps({
				manualMappings: [
					{
						anilistId: aid(3),
						provider: "radarr",
						providerId: tmdb(1234),
						updatedAt: 30,
					},
				],
			}),
		);

		const rows = getRows(result);
		expect(rows).toHaveLength(1);
		const row = rows[0];
		expect(row).toMatchObject({
			anilistId: aid(3),
			provider: "radarr",
			providerId: tmdb(1234),
			mappingRowStatus: "can-add",
			isInLibrary: false,
			mappingSource: "manual",
			mappingReason: "manual-override",
			resolverOutcome: "mapped",
		});
		expect(row!.reviewSummary).toBeUndefined();
		expect(row!.reviewItems).toBeUndefined();
		expect(row?.mappingEntryKind).toBe("manual");
	});

	it("keeps ignores effective while surfacing exact upstream conflicts", async () => {
		const result = await listMappings(
			{ limit: 10 },
			createDeps({
				ignores: [
					{
						anilistId: aid(2),
						provider: "sonarr",
						updatedAt: 15,
					},
				],
				providerMappings: [
					{ provider: "sonarr", anilistId: aid(2), providerId: tvdb(333) },
				],
			}),
		);

		const rows = getRows(result);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			anilistId: aid(2),
			provider: "sonarr",
			providerId: null,
			mappingRowStatus: "needs-review",
			isInLibrary: null,
			suppressionKind: "ignored-entry",
			reviewSummary: {
				count: 1,
				primaryReason: "ignored-but-exact-upstream",
				reasons: ["ignored-but-exact-upstream"],
			},
			reviewItems: [
				expect.objectContaining({
					reason: "ignored-but-exact-upstream",
					current: expect.objectContaining({
						mappingEntryKind: "ignored",
						providerId: null,
					}),
					proposed: expect.objectContaining({
						mappingEntryKind: "upstream",
						providerId: tvdb(333),
						acceptedReason: "exact-upstream",
					}),
				}),
			],
		});
		expect(rows[0]?.mappingEntryKind).toBe("ignored");
	});

	it("does not let rejected candidates hide exact upstream truth", async () => {
		const result = await listMappings(
			{ limit: 10 },
			createDeps({
				rejected: [
					{
						anilistId: aid(7),
						provider: "sonarr",
						providerId: tvdb(999),
						updatedAt: 25,
					},
				],
				providerMappings: [
					{ provider: "sonarr", anilistId: aid(7), providerId: tvdb(444) },
				],
			}),
		);

		const rows = getRows(result);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			anilistId: aid(7),
			provider: "sonarr",
			providerId: tvdb(444),
			mappingRowStatus: "can-add",
			isInLibrary: false,
			mappingSource: "upstream",
			mappingReason: "exact-upstream",
			resolverOutcome: "mapped",
		});
		expect(rows[0]?.suppressedProviderId).toBeUndefined();
		expect(rows[0]?.suppressionKind).toBeUndefined();
		expect(rows[0]?.mappingEntryKind).toBe("upstream");
	});

	it("preserves rejected-candidate suppression on mapped auto-mapping rows", async () => {
		const result = await listMappings(
			{ limit: 10 },
			createDeps({
				rejected: [
					{
						anilistId: aid(8),
						provider: "sonarr",
						providerId: tvdb(901),
						updatedAt: 95,
					},
				],
				autoMappings: [
					{
						anilistId: aid(8),
						provider: "sonarr",
						state: "mapped",
						providerId: tvdb(900),
						acceptedEvidence: {
							source: "auto",
							reason: "fuzzy-match",
						},
						updatedAt: 90,
					},
				],
			}),
		);

		const rows = getRows(result);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			anilistId: aid(8),
			provider: "sonarr",
			providerId: tvdb(900),
			suppressedProviderId: 901,
			suppressionKind: "rejected-candidate",
			mappingRowStatus: "suppressed",
			isInLibrary: false,
			mappingSource: "auto",
			mappingReason: "fuzzy-match",
			resolverOutcome: "mapped",
		});
		expect(rows[0]?.mappingEntryKind).toBe("auto");
	});

	it("projects linked provider identity groups and in-library status as first-class summary fields", async () => {
		const result = await listMappings(
			{ limit: 10 },
			createDeps({
				manualMappings: [
					{
						anilistId: aid(15),
						provider: "sonarr",
						providerId: tvdb(222),
						updatedAt: 30,
					},
				],
				providerMappings: [
					{ provider: "sonarr", anilistId: aid(16), providerId: tvdb(222) },
				],
				series: [
					{
						id: 1,
						tvdbId: 222,
						title: "Linked Show",
						titleSlug: "linked-show",
						status: "continuing",
						statistics: { episodeCount: 12 },
					} as unknown as SonarrSeriesSnapshot,
				],
			}),
		);

		expect(getRows(result)[0]).toMatchObject({
			anilistId: aid(15),
			provider: "sonarr",
			providerId: tvdb(222),
			mappingRowStatus: "in-library",
			isInLibrary: true,
			mappingSource: "manual",
			mappingReason: "manual-override",
			resolverOutcome: "mapped",
			linkedAniListIds: [aid(15), aid(16)],
			inLibraryCount: 12,
			providerMeta: {
				title: "Linked Show",
				type: "series",
				statusLabel: "continuing",
			},
		});
	});

	it("groups all AniList rows linked to the same TVDB target before paging", async () => {
		const danDaDanTvdbId = tvdb(432_832);
		const result = await listMappings(
			{ limit: 100 },
			createDeps({
				providerMappings: [
					{
						provider: "sonarr",
						anilistId: aid(171_018),
						providerId: danDaDanTvdbId,
					},
					{
						provider: "sonarr",
						anilistId: aid(185_660),
						providerId: danDaDanTvdbId,
					},
				],
				series: [
					{
						id: 1,
						tvdbId: danDaDanTvdbId,
						title: "DAN DA DAN",
						titleSlug: "dan-da-dan",
						status: "continuing",
					} as unknown as SonarrSeriesSnapshot,
				],
				autoMappings: [
					{
						anilistId: aid(199_866),
						provider: "sonarr",
						state: "mapped",
						providerId: danDaDanTvdbId,
						acceptedEvidence: {
							source: "auto",
							reason: "fuzzy-match",
						},
						updatedAt: 90,
					},
				],
			}),
		);

		expect(result.groups).toHaveLength(1);
		expect(result.groups[0]).toMatchObject({
			key: "sonarr:432832",
			provider: "sonarr",
			providerId: danDaDanTvdbId,
			linkedCount: 3,
			providerMeta: {
				title: "DAN DA DAN",
				type: "series",
				statusLabel: "continuing",
			},
		});
		expect(result.groups[0]?.linkedAniListIds).toEqual([
			aid(171_018),
			aid(185_660),
			aid(199_866),
		]);
		expect(
			result.groups[0]?.rows
				.map((row) => row.anilistId)
				.toSorted((left, right) => left - right),
		).toEqual([aid(171_018), aid(185_660), aid(199_866)]);
	});

	it("does not split provider target groups across cursor pages", async () => {
		const danDaDanTvdbId = tvdb(432_832);
		const firstPage = await listMappings(
			{ limit: 1 },
			createDeps({
				providerMappings: [
					{
						provider: "sonarr",
						anilistId: aid(171_018),
						providerId: danDaDanTvdbId,
					},
					{
						provider: "sonarr",
						anilistId: aid(185_660),
						providerId: danDaDanTvdbId,
					},
				],
				autoMappings: [
					{
						anilistId: aid(199_866),
						provider: "sonarr",
						state: "mapped",
						providerId: danDaDanTvdbId,
						acceptedEvidence: {
							source: "auto",
							reason: "fuzzy-match",
						},
						updatedAt: 90,
					},
					{
						anilistId: aid(10),
						provider: "sonarr",
						state: "mapped",
						providerId: tvdb(1000),
						acceptedEvidence: {
							source: "auto",
							reason: "fuzzy-match",
						},
						updatedAt: 80,
					},
				],
			}),
		);

		expect(firstPage.total).toBe(2);
		expect(firstPage.groups).toHaveLength(1);
		expect(firstPage.groups[0]?.key).toBe("sonarr:432832");
		expect(firstPage.groups[0]?.rows).toHaveLength(3);
		expect(firstPage.nextCursor).toEqual({
			updatedAt: 90,
			groupKey: "sonarr:432832",
		});

		const secondPage = await listMappings(
			{ limit: 1, cursor: firstPage.nextCursor ?? undefined },
			createDeps({
				providerMappings: [
					{
						provider: "sonarr",
						anilistId: aid(171_018),
						providerId: danDaDanTvdbId,
					},
					{
						provider: "sonarr",
						anilistId: aid(185_660),
						providerId: danDaDanTvdbId,
					},
				],
				autoMappings: [
					{
						anilistId: aid(199_866),
						provider: "sonarr",
						state: "mapped",
						providerId: danDaDanTvdbId,
						acceptedEvidence: {
							source: "auto",
							reason: "fuzzy-match",
						},
						updatedAt: 90,
					},
					{
						anilistId: aid(10),
						provider: "sonarr",
						state: "mapped",
						providerId: tvdb(1000),
						acceptedEvidence: {
							source: "auto",
							reason: "fuzzy-match",
						},
						updatedAt: 80,
					},
				],
			}),
		);

		expect(secondPage.groups).toHaveLength(1);
		expect(secondPage.groups[0]?.key).toBe("sonarr:1000");
	});

	it("returns a complete group when search matches one child row", async () => {
		const danDaDanTvdbId = tvdb(432_832);
		const result = await listMappings(
			{ limit: 100, query: "199866" },
			createDeps({
				providerMappings: [
					{
						provider: "sonarr",
						anilistId: aid(171_018),
						providerId: danDaDanTvdbId,
					},
					{
						provider: "sonarr",
						anilistId: aid(185_660),
						providerId: danDaDanTvdbId,
					},
				],
				autoMappings: [
					{
						anilistId: aid(199_866),
						provider: "sonarr",
						state: "mapped",
						providerId: danDaDanTvdbId,
						acceptedEvidence: {
							source: "auto",
							reason: "fuzzy-match",
						},
						updatedAt: 90,
					},
				],
			}),
		);

		expect(result.groups).toHaveLength(1);
		expect(result.groups[0]?.rows).toHaveLength(3);
	});

	it("returns a complete group when status matches one child row", async () => {
		const danDaDanTvdbId = tvdb(432_832);
		const result = await listMappings(
			{ limit: 100, statuses: ["suppressed"] },
			createDeps({
				rejected: [
					{
						anilistId: aid(199_866),
						provider: "sonarr",
						providerId: danDaDanTvdbId,
						updatedAt: 95,
					},
				],
				providerMappings: [
					{
						provider: "sonarr",
						anilistId: aid(171_018),
						providerId: danDaDanTvdbId,
					},
					{
						provider: "sonarr",
						anilistId: aid(185_660),
						providerId: danDaDanTvdbId,
					},
				],
				autoMappings: [
					{
						anilistId: aid(199_866),
						provider: "sonarr",
						state: "mapped",
						providerId: danDaDanTvdbId,
						acceptedEvidence: {
							source: "auto",
							reason: "fuzzy-match",
						},
						updatedAt: 90,
					},
				],
			}),
		);

		expect(result.groups).toHaveLength(1);
		expect(result.groups[0]?.rows).toHaveLength(3);
		expect(
			result.groups[0]?.rows.some(
				(row) => row.mappingRowStatus === "suppressed",
			),
		).toBe(true);
	});

	it("keeps null-provider rows as separate one-row groups", async () => {
		const result = await listMappings(
			{ limit: 100 },
			createDeps({
				autoMappings: [
					{
						anilistId: aid(1),
						provider: "sonarr",
						state: "unresolved",
						updatedAt: 10,
					},
					{
						anilistId: aid(2),
						provider: "sonarr",
						state: "unresolved",
						updatedAt: 20,
					},
				],
			}),
		);

		expect(result.groups.map((group) => group.key).toSorted()).toEqual([
			"sonarr:unmapped:1",
			"sonarr:unmapped:2",
		]);
		expect(result.groups.every((group) => group.rows.length === 1)).toBe(true);
	});

	it("skips unused provider library reads for single-provider pages", async () => {
		let sonarrReads = 0;
		let radarrReads = 0;
		let autoMappingListProvider: "sonarr" | "radarr" | undefined;
		const deps = createDeps({
			autoMappings: [
				{
					anilistId: aid(1),
					provider: "sonarr",
					state: "mapped",
					providerId: tvdb(10),
					acceptedEvidence: {
						source: "auto",
						reason: "fuzzy-match",
					},
					updatedAt: 10,
				},
			],
		});
		deps.sonarrLibrary = {
			getLeanSeriesList: async () => {
				sonarrReads += 1;
				return [];
			},
		};
		deps.radarrLibrary = {
			getLeanMovieList: async () => {
				radarrReads += 1;
				return [];
			},
		};
		deps.autoMappingStore = {
			list: async (provider) => {
				autoMappingListProvider = provider;
				return createAutoMappingStore([
					{
						anilistId: aid(1),
						provider: "sonarr",
						state: "mapped",
						providerId: tvdb(10),
						acceptedEvidence: {
							source: "auto",
							reason: "fuzzy-match",
						},
						updatedAt: 10,
					},
				]).list(provider);
			},
		};

		const result = await listMappings(
			{ providers: ["sonarr"], limit: 100 },
			deps,
		);

		expect(result.groups.every((group) => group.provider === "sonarr")).toBe(
			true,
		);
		expect(sonarrReads).toBe(1);
		expect(radarrReads).toBe(0);
		expect(autoMappingListProvider).toBe("sonarr");
	});

	it("reuses cached projections avoiding source derivation across filtered reads", async () => {
		let listReads = 0;
		let sonarrReads = 0;
		const danDaDanTvdbId = tvdb(432_832);
		const projectionCache = new Map();
		const deps = createDeps({
			providerMappings: [
				{
					provider: "sonarr",
					anilistId: aid(171_018),
					providerId: danDaDanTvdbId,
				},
			],
		});
		deps.manualMappingService.list = () => {
			listReads += 1;
			return [];
		};
		deps.sonarrLibrary = {
			getLeanSeriesList: async () => {
				sonarrReads += 1;
				return [];
			},
		};
		const cacheInput = {
			projectionCache,
			projectionCacheKey: "revision:1",
		};

		await listMappings({ limit: 100 }, { ...deps, ...cacheInput });
		await listMappings(
			{ limit: 100, query: "171018" },
			{ ...deps, ...cacheInput },
		);

		// The list method on manual mappings is only called when building new projection groups
		expect(listReads).toBe(1);
		// The library snapshot fetch is also avoided on cache hit
		expect(sonarrReads).toBe(1);
	});
});
