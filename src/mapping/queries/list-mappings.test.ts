/** Tests for the mapping review projection and paging logic. */
// src/mapping/queries/list-mappings.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId, type AniListId } from "@/anilist";
import {
	parseTvdbId,
	type SonarrSeriesSnapshot,
	type TmdbId,
	type TvdbId,
} from "@/providers";
import type { AutoMappingRecord } from "@/mapping/auto-mapping/types";
import { listMappings, type ListMappingsDeps } from "./list-mappings";

const aid = parseAniListId;
const tvdb = parseTvdbId;

type TestProviderMapping =
	| { provider: "sonarr"; anilistId: AniListId; providerId: TvdbId }
	| { provider: "radarr"; anilistId: AniListId; providerId: TmdbId };

const createAutoMappingStore = (
	entries: Array<
		AutoMappingRecord & { anilistId: AniListId; provider: "sonarr" | "radarr" }
	> = [],
) => ({
	list: async () => entries,
});

const createAnibridgeStore = (
	providerMappings: TestProviderMapping[] = [],
): ListMappingsDeps["anibridgeMappingStore"] => ({
	listAllProviderPairs: () => providerMappings,
	getSonarrCandidates: (anilistId: AniListId) =>
		providerMappings
			.filter(
				(
					providerMapping,
				): providerMapping is Extract<
					TestProviderMapping,
					{ provider: "sonarr" }
				> =>
					providerMapping.provider === "sonarr" &&
					providerMapping.anilistId === anilistId,
			)
			.map((providerMapping) => providerMapping.providerId),
	getRadarrCandidates: (anilistId: AniListId) =>
		providerMappings
			.filter(
				(
					providerMapping,
				): providerMapping is Extract<
					TestProviderMapping,
					{ provider: "radarr" }
				> =>
					providerMapping.provider === "radarr" &&
					providerMapping.anilistId === anilistId,
			)
			.map((providerMapping) => providerMapping.providerId),
	getAniListIdsForTvdb: (tvdbId: TvdbId) =>
		providerMappings
			.filter(
				(providerMapping) =>
					providerMapping.provider === "sonarr" &&
					providerMapping.providerId === tvdbId,
			)
			.map((providerMapping) => providerMapping.anilistId),
	getAniListIdsForTmdb: (tmdbId: TmdbId) =>
		providerMappings
			.filter(
				(providerMapping) =>
					providerMapping.provider === "radarr" &&
					providerMapping.providerId === tmdbId,
			)
			.map((providerMapping) => providerMapping.anilistId),
});

describe("listMappings", () => {
	it("collapses matching manual mappings into exact upstream truth and preserves unresolved entries", async () => {
		const result = await listMappings(
			{ limit: 10 },
			{
				manualMappingService: {
					listIgnores: () => [],
					listRejectedCandidates: () => [],
					list: () => [
						{
							anilistId: aid(1),
							provider: "sonarr",
							providerId: tvdb(222),
							updatedAt: 100,
						},
					],
					isIgnored: () => false,
					getLinkedAniListIds: () => [],
				},
				anibridgeMappingStore: createAnibridgeStore([
					{ provider: "sonarr", anilistId: aid(1), providerId: tvdb(222) },
				]),
				sonarrLibrary: {
					getLeanSeriesList: async () => [],
				},
				radarrLibrary: {
					getLeanMovieList: async () => [],
				},
				autoMappingStore: createAutoMappingStore([
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
				]),
			},
		);

		expect(result.total).toBe(2);
		const upstreamRow = result.mappings.find((entry) => entry.anilistId === 1);
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

		const unresolvedRow = result.mappings.find(
			(entry) => entry.anilistId === 2,
		);
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
			{
				manualMappingService: {
					listIgnores: () => [],
					listRejectedCandidates: () => [],
					list: () => [
						{
							anilistId: aid(1),
							provider: "sonarr",
							providerId: tvdb(777),
							updatedAt: 20,
						},
					],
					isIgnored: () => false,
					getLinkedAniListIds: () => [],
				},
				anibridgeMappingStore: createAnibridgeStore([
					{ provider: "sonarr", anilistId: aid(1), providerId: tvdb(555) },
				]),
				sonarrLibrary: {
					getLeanSeriesList: async () => [],
				},
				radarrLibrary: {
					getLeanMovieList: async () => [],
				},
				autoMappingStore: createAutoMappingStore(),
			},
		);

		expect(result.mappings).toHaveLength(1);
		expect(result.mappings[0]).toMatchObject({
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
		expect(result.mappings[0]?.mappingEntryKind).toBe("manual");
	});

	it("projects manual mappings without upstream conflicts when no exact upstream exists", async () => {
		const result = await listMappings(
			{ limit: 10 },
			{
				manualMappingService: {
					listIgnores: () => [],
					listRejectedCandidates: () => [],
					list: () => [
						{
							anilistId: aid(3),
							provider: "radarr",
							providerId: tvdb(1234),
							updatedAt: 30,
						},
					],
					isIgnored: () => false,
					getLinkedAniListIds: () => [],
				},
				anibridgeMappingStore: createAnibridgeStore(),
				sonarrLibrary: {
					getLeanSeriesList: async () => [],
				},
				radarrLibrary: {
					getLeanMovieList: async () => [],
				},
				autoMappingStore: createAutoMappingStore(),
			},
		);

		expect(result.mappings).toHaveLength(1);
		const row = result.mappings[0];
		expect(row).toMatchObject({
			anilistId: aid(3),
			provider: "radarr",
			providerId: tvdb(1234),
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
			{
				manualMappingService: {
					listIgnores: () => [
						{
							anilistId: aid(2),
							provider: "sonarr",
							updatedAt: 15,
						},
					],
					listRejectedCandidates: () => [],
					list: () => [],
					isIgnored: () => true,
					getLinkedAniListIds: () => [],
				},
				anibridgeMappingStore: createAnibridgeStore([
					{ provider: "sonarr", anilistId: aid(2), providerId: tvdb(333) },
				]),
				sonarrLibrary: {
					getLeanSeriesList: async () => [],
				},
				radarrLibrary: {
					getLeanMovieList: async () => [],
				},
				autoMappingStore: createAutoMappingStore(),
			},
		);

		expect(result.mappings).toHaveLength(1);
		expect(result.mappings[0]).toMatchObject({
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
		expect(result.mappings[0]?.mappingEntryKind).toBe("ignored");
	});

	it("does not let rejected candidates hide exact upstream truth", async () => {
		const result = await listMappings(
			{ limit: 10 },
			{
				manualMappingService: {
					listIgnores: () => [],
					listRejectedCandidates: () => [
						{
							anilistId: aid(7),
							provider: "sonarr",
							providerId: tvdb(999),
							updatedAt: 25,
						},
					],
					list: () => [],
					isIgnored: () => false,
					getLinkedAniListIds: () => [],
				},
				anibridgeMappingStore: createAnibridgeStore([
					{ provider: "sonarr", anilistId: aid(7), providerId: tvdb(444) },
				]),
				sonarrLibrary: {
					getLeanSeriesList: async () => [],
				},
				radarrLibrary: {
					getLeanMovieList: async () => [],
				},
				autoMappingStore: createAutoMappingStore(),
			},
		);

		expect(result.mappings).toHaveLength(1);
		expect(result.mappings[0]).toMatchObject({
			anilistId: aid(7),
			provider: "sonarr",
			providerId: tvdb(444),
			mappingRowStatus: "can-add",
			isInLibrary: false,
			mappingSource: "upstream",
			mappingReason: "exact-upstream",
			resolverOutcome: "mapped",
		});
		expect(result.mappings[0]?.suppressedProviderId).toBeUndefined();
		expect(result.mappings[0]?.suppressionKind).toBeUndefined();
		expect(result.mappings[0]?.mappingEntryKind).toBe("upstream");
	});

	it("preserves rejected-candidate suppression on mapped auto-mapping rows", async () => {
		const result = await listMappings(
			{ limit: 10 },
			{
				manualMappingService: {
					listIgnores: () => [],
					listRejectedCandidates: () => [
						{
							anilistId: aid(8),
							provider: "sonarr",
							providerId: tvdb(901),
							updatedAt: 95,
						},
					],
					list: () => [],
					isIgnored: () => false,
					getLinkedAniListIds: () => [],
				},
				anibridgeMappingStore: createAnibridgeStore(),
				sonarrLibrary: {
					getLeanSeriesList: async () => [],
				},
				radarrLibrary: {
					getLeanMovieList: async () => [],
				},
				autoMappingStore: createAutoMappingStore([
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
				]),
			},
		);

		expect(result.mappings).toHaveLength(1);
		expect(result.mappings[0]).toMatchObject({
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
		expect(result.mappings[0]?.mappingEntryKind).toBe("auto");
	});

	it("projects linked provider identity groups and in-library status as first-class summary fields", async () => {
		const result = await listMappings(
			{ limit: 10 },
			{
				manualMappingService: {
					listIgnores: () => [],
					listRejectedCandidates: () => [],
					list: () => [
						{
							anilistId: aid(15),
							provider: "sonarr",
							providerId: tvdb(222),
							updatedAt: 30,
						},
					],
					isIgnored: () => false,
					getLinkedAniListIds: () => [aid(15), aid(16)],
				},
				anibridgeMappingStore: createAnibridgeStore([
					{ provider: "sonarr", anilistId: aid(16), providerId: tvdb(222) },
				]),
				sonarrLibrary: {
					getLeanSeriesList: async () => [
						{
							id: 1,
							tvdbId: 222,
							title: "Linked Show",
							titleSlug: "linked-show",
							status: "continuing",
							statistics: { episodeCount: 12 },
						} as unknown as SonarrSeriesSnapshot,
					],
				},
				radarrLibrary: {
					getLeanMovieList: async () => [],
				},
				autoMappingStore: createAutoMappingStore(),
			},
		);

		expect(result.mappings[0]).toMatchObject({
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
});
