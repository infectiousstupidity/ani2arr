/** Tests for mapping inspection payload composition from stored mapping state. */
// src/mapping/queries/mapping-details.test.ts

import { describe, expect, it, vi } from "vitest";
import { parseAniListId, type AniListId } from "@/anilist";
import { parseTvdbId } from "@/providers";
import type { AniListMetadata } from "@/anilist/schemas/metadata.schema";
import type { AutoMappingRecord } from "@/mapping/auto-mapping/types";
import type { ProviderExternalId } from "@/mapping/types";
import {
	getMappingInspection,
	type GetMappingInspectionDeps,
} from "./mapping-details";

const aid = parseAniListId;
const tvdb = parseTvdbId;

const createDeps = (input?: {
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
}) => {
	const metadataSpy = vi.fn(async () => ({
		metadata: input?.linkedMetadata ?? [],
	}));

	return {
		manualMappingService: {
			get: vi.fn(() => input?.manualProviderId ?? null),
			isIgnored: vi.fn(() => input?.ignored ?? false),
			listRejectedCandidates: vi.fn(() => input?.rejectedCandidates ?? []),
			getLinkedAniListIds: vi.fn(() => input?.linkedAniListIds ?? []),
		},
		anibridgeMappingStore: {
			getSonarrCandidates: vi.fn(() => input?.upstreamProviderIds ?? []),
			getRadarrCandidates: vi.fn(() => input?.upstreamProviderIds ?? []),
			getAniListIdsForTvdb: vi.fn(
				() => input?.upstreamLinkedAniListIds ?? [],
			),
			getAniListIdsForTmdb: vi.fn(
				() => input?.upstreamLinkedAniListIds ?? [],
			),
		},
		autoMappingStore: {
			get: vi.fn(async () => input?.autoMappingStatus ?? null),
			list: vi.fn(async () => input?.autoMappingRecordList ?? []),
		},
		anilistMetadataStore: {
			getMetadata: metadataSpy,
		},
		metadataSpy,
	} as GetMappingInspectionDeps & { metadataSpy: typeof metadataSpy };
};

describe("getMappingInspection", () => {
	it("returns linked AniList entries for exact upstream mappings", async () => {
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
					coverImage: {
						medium: "https://img.example/linked-show-s1-medium.jpg",
						large: "https://img.example/linked-show-s1-large.jpg",
					},
					updatedAt: 1,
				},
				{
					id: aid(16),
					titles: { english: "Linked Show Season 2" },
					format: "TV",
					seasonYear: 2021,
					coverImage: {
						medium: "https://img.example/linked-show-s2-medium.jpg",
						large: "https://img.example/linked-show-s2-large.jpg",
					},
					updatedAt: 1,
				},
			],
		});

		const payload = await getMappingInspection(
			{ provider: "sonarr", anilistId: aid(15) },
			deps,
		);

		expect(payload.effectiveMapping).toEqual({
			providerId: tvdb(222),
			mappingEntryKind: "upstream",
		});
		expect(payload.linkedAniListEntries).toEqual([
			{
				anilistId: 15,
				title: "Linked Show Season 1",
				format: "TV",
				year: 2020,
				coverImage: "https://img.example/linked-show-s1-medium.jpg",
				relation: "current",
			},
			{
				anilistId: 16,
				title: "Linked Show Season 2",
				format: "TV",
				year: 2021,
				coverImage: "https://img.example/linked-show-s2-medium.jpg",
			},
		]);
		expect(deps.metadataSpy).toHaveBeenCalledWith(
			[15, 16],
			expect.objectContaining({
				refreshStale: false,
				fetchMissing: false,
			}),
		);
	});

	it("preserves rejected-candidate suppression for modal actions", async () => {
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

		expect(payload.effectiveMapping).toEqual({
			providerId: tvdb(900),
			suppressedProviderId: tvdb(901),
			mappingEntryKind: "auto",
		});
	});

	it("preserves ignored entry state for modal actions", async () => {
		const deps = createDeps({ ignored: true });

		const payload = await getMappingInspection(
			{ provider: "radarr", anilistId: aid(12) },
			deps,
		);

		expect(payload.effectiveMapping).toEqual({
			providerId: null,
			mappingEntryKind: "ignored",
		});
	});

	it("returns no linked entries when no mapping state exists", async () => {
		const deps = createDeps();

		const payload = await getMappingInspection(
			{ provider: "radarr", anilistId: aid(404) },
			deps,
		);

		expect(payload).toEqual({
			effectiveMapping: {
				providerId: null,
				mappingEntryKind: "unmapped",
			},
			linkedAniListEntries: [],
		});
		expect(deps.metadataSpy).not.toHaveBeenCalled();
	});
});
