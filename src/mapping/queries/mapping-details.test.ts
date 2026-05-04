/** Tests for mapping inspection payload composition from stored mapping state. */
// src/mapping/queries/mapping-details.test.ts

import { describe, expect, it, vi } from "vitest";
import { parseAniListId, type AniListId } from "@/anilist";
import {
	parseSonarrSeriesId,
	parseTvdbId,
	type RadarrMovieSnapshot,
	type SonarrSeriesSnapshot,
} from "@/providers";
import type { ProviderExternalId } from "@/mapping/types";
import type { AniListMetadata } from "@/anilist/schemas/metadata.schema";
import type { AutoMappingRecord } from "@/mapping/auto-mapping/types";
import {
	getMappingInspection,
	type GetMappingInspectionDeps,
} from "./mapping-details";

const aid = parseAniListId;
const tvdb = parseTvdbId;
const sonarrSeriesId = parseSonarrSeriesId;

const createDeps = (manualMappings?: {
	manualProviderId?: ProviderExternalId | null;
	ignored?: boolean;
	rejectedCandidates?: Array<{
		anilistId: AniListId;
		provider: "sonarr" | "radarr";
		providerId: ProviderExternalId;
		updatedAt: number;
	}>;
	linkedAniListIds?: AniListId[];
	upstreamProviderIds?: ProviderExternalId[];
	upstreamLinkedAniListIds?: AniListId[];
	autoMappingStatus?: AutoMappingRecord | null;
	autoMappingRecordList?: Array<
		AutoMappingRecord & { anilistId: AniListId; provider: "sonarr" | "radarr" }
	>;
	linkedMetadata?: AniListMetadata[];
	sonarrLibrary?: SonarrSeriesSnapshot[];
	radarrLibrary?: RadarrMovieSnapshot[];
}) => {
	const metadataSpy = vi.fn(async () => ({
		metadata: manualMappings?.linkedMetadata ?? [],
	}));

	return {
		manualMappingService: {
			get: vi.fn(() => manualMappings?.manualProviderId ?? null),
			isIgnored: vi.fn(() => manualMappings?.ignored ?? false),
			listRejectedCandidates: vi.fn(
				() => manualMappings?.rejectedCandidates ?? [],
			),
			getLinkedAniListIds: vi.fn(() => manualMappings?.linkedAniListIds ?? []),
		},
		anibridgeMappingStore: {
			getSonarrCandidates: vi.fn(
				() => manualMappings?.upstreamProviderIds ?? [],
			),
			getRadarrCandidates: vi.fn(
				() => manualMappings?.upstreamProviderIds ?? [],
			),
			getAniListIdsForTvdb: vi.fn(
				() => manualMappings?.upstreamLinkedAniListIds ?? [],
			),
			getAniListIdsForTmdb: vi.fn(
				() => manualMappings?.upstreamLinkedAniListIds ?? [],
			),
		},
		autoMappingStore: {
			get: vi.fn(async () => manualMappings?.autoMappingStatus ?? null),
			list: vi.fn(async () => manualMappings?.autoMappingRecordList ?? []),
		},
		anilistMetadataStore: {
			getMetadata: metadataSpy,
		},
		sonarrLibrary: {
			getLeanSeriesList: vi.fn(async () => manualMappings?.sonarrLibrary ?? []),
		},
		radarrLibrary: {
			getLeanMovieList: vi.fn(async () => manualMappings?.radarrLibrary ?? []),
		},
		metadataSpy,
	} as GetMappingInspectionDeps & { metadataSpy: typeof metadataSpy };
};

describe("getMappingInspection", () => {
	it("composes linked groups, explanation, and provider library context for exact upstream mappings", async () => {
		const deps = createDeps({
			upstreamProviderIds: [tvdb(222)],
			upstreamLinkedAniListIds: [aid(16)],
			autoMappingRecordList: [
				{
					anilistId: aid(15),
					provider: "sonarr",
					state: "mapped",
					providerId: tvdb(222),
					acceptedEvidence: {
						source: "auto",
						reason: "fuzzy-match",
					},
					updatedAt: 10,
				},
				{
					anilistId: aid(16),
					provider: "sonarr",
					state: "mapped",
					providerId: tvdb(222),
					acceptedEvidence: {
						source: "auto",
						reason: "fuzzy-match",
					},
					updatedAt: 9,
				},
			],
			linkedMetadata: [
				{
					id: aid(15),
					titles: { english: "Linked Show Season 1" },
					format: "TV",
					seasonYear: 2020,
					updatedAt: 1,
				},
				{
					id: aid(16),
					titles: { english: "Linked Show Season 2" },
					format: "TV",
					seasonYear: 2021,
					updatedAt: 1,
				},
			],
			sonarrLibrary: [
				{
					id: sonarrSeriesId(1),
					tvdbId: tvdb(222),
					title: "Linked Show",
					titleSlug: "linked-show",
					status: "continuing",
					statistics: { episodeCount: 24 },
				},
			],
		});

		const payload = await getMappingInspection(
			{ provider: "sonarr", anilistId: aid(15) },
			deps,
		);

		expect(payload.effectiveMapping).toMatchObject({
			provider: "sonarr",
			anilistId: 15,
			providerId: tvdb(222),
			providerMappingState: "mapped",
			mappingRowStatus: "in-library",
			isInLibrary: true,
			mappingEntryKind: "upstream",
			mappingSource: "upstream",
			mappingReason: "exact-upstream",
			library: {
				isInLibrary: true,
				title: "Linked Show",
				type: "series",
				statusLabel: "continuing",
				inLibraryCount: 24,
			},
		});
		expect(payload.providerContext).toEqual({
			provider: "sonarr",
			providerId: tvdb(222),
			linkedAniListIds: [15, 16],
			linkedAniListCount: 2,
		});
		expect(payload.linkedAniListEntries).toEqual([
			{
				anilistId: 15,
				title: "Linked Show Season 1",
				format: "TV",
				year: 2020,
				relation: "current",
			},
			{
				anilistId: 16,
				title: "Linked Show Season 2",
				format: "TV",
				year: 2021,
			},
		]);
		expect(payload.whyThisMapping).toContainEqual(
			expect.objectContaining({
				kind: "effective-source",
				summary: "Exact upstream mapping is currently effective.",
				source: "upstream",
				reason: "exact-upstream",
			}),
		);
		expect(deps.metadataSpy).toHaveBeenCalledWith(
			[15, 16],
			expect.objectContaining({
				refreshStale: false,
				fetchMissing: false,
			}),
		);
	});

	it("preserves rejected-candidate suppression on mapped auto-mapping inspection payloads", async () => {
		const deps = createDeps({
			rejectedCandidates: [
				{
					anilistId: aid(11),
					provider: "sonarr",
					providerId: tvdb(901),
					updatedAt: 95,
				},
			],
			autoMappingStatus: {
				state: "mapped",
				providerId: tvdb(900),
				acceptedEvidence: {
					source: "auto",
					reason: "fuzzy-match",
				},
				updatedAt: 90,
			},
		});

		const payload = await getMappingInspection(
			{ provider: "sonarr", anilistId: aid(11) },
			deps,
		);

		expect(payload.effectiveMapping).toMatchObject({
			provider: "sonarr",
			anilistId: 11,
			providerId: tvdb(900),
			providerMappingState: "mapped",
			mappingRowStatus: "suppressed",
			isInLibrary: false,
			suppressedProviderId: 901,
			suppressionKind: "rejected-candidate",
			mappingEntryKind: "auto",
			mappingSource: "auto",
			mappingReason: "fuzzy-match",
			resolverOutcome: "mapped",
		});
		expect(payload.review).toEqual({
			needsReview: false,
			summary: undefined,
			items: undefined,
		});
		expect(payload.whyThisMapping).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "effective-source",
					summary: "Fuzzy fallback match is currently effective.",
				}),
				expect.objectContaining({
					kind: "suppression",
					summary: "Candidate 901 was rejected for this AniList entry.",
					suppressedProviderId: 901,
				}),
			]),
		);
	});

	it("surfaces review detail and explanation for manual upstream disagreements", async () => {
		const deps = createDeps({
			manualProviderId: tvdb(777),
			upstreamProviderIds: [tvdb(555)],
		});

		const payload = await getMappingInspection(
			{ provider: "sonarr", anilistId: aid(1) },
			deps,
		);

		expect(payload.effectiveMapping).toMatchObject({
			providerId: tvdb(777),
			providerMappingState: "mapped",
			mappingRowStatus: "needs-review",
			mappingEntryKind: "manual",
			mappingSource: "manual",
			mappingReason: "manual-override",
		});
		expect(payload.review).toMatchObject({
			needsReview: true,
			summary: {
				count: 1,
				primaryReason: "manual-upstream-disagreement",
				reasons: ["manual-upstream-disagreement"],
			},
			items: [
				expect.objectContaining({
					reason: "manual-upstream-disagreement",
					proposed: expect.objectContaining({ providerId: tvdb(555) }),
				}),
			],
		});
		expect(payload.whyThisMapping).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "effective-source",
					summary: "Manual mapping is currently effective.",
				}),
				expect.objectContaining({
					kind: "review",
					reviewReason: "manual-upstream-disagreement",
				}),
			]),
		);
	});

	it("returns a cheap unresolved detail payload when no mapping state exists yet", async () => {
		const deps = createDeps();

		const payload = await getMappingInspection(
			{ provider: "radarr", anilistId: aid(404) },
			deps,
		);

		expect(payload).toMatchObject({
			effectiveMapping: {
				provider: "radarr",
				anilistId: 404,
				providerId: null,
				providerMappingState: "unmapped",
				mappingRowStatus: "unmapped",
				isInLibrary: null,
				mappingEntryKind: "unmapped",
			},
			providerContext: {
				provider: "radarr",
				providerId: null,
				linkedAniListIds: [],
				linkedAniListCount: 0,
			},
			linkedAniListEntries: [],
			review: {
				needsReview: false,
			},
		});
		expect(payload.whyThisMapping).toEqual([
			{
				kind: "resolver-outcome",
				summary:
					"No effective mapping is currently stored for this AniList entry.",
			},
		]);
		expect(deps.metadataSpy).not.toHaveBeenCalled();
	});
});
