/** Tests for RPC mapping inspection payload composition. */
// src/rpc/mapping-inspection.test.ts

import { describe, expect, it, vi } from "vitest";
import { parseAniListId, type AniListMetadata } from "@/anilist/types";
import { getUniqueAniListIdForSource } from "@/mapping/upstream.store";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { getMappingInspection } from "./mapping-inspection";

vi.mock("@/mapping/upstream.store", () => ({
	getUniqueAniListIdForSource: vi.fn(),
}));

const aid = parseAniListId;
const mal = parseMyAnimeListId;

describe("getMappingInspection", () => {
	it("loads linked AniList metadata for mapped targets", async () => {
		const linkedMetadata: AniListMetadata[] = [
			{
				id: aid(10),
				titles: { english: "Current Show" },
				format: "TV",
				seasonYear: 2024,
				coverImage: {
					medium: "https://img.example/current-medium.jpg",
					large: "https://img.example/current-large.jpg",
				},
			},
			{
				id: aid(11),
				titles: { romaji: "Linked Show" },
				format: "TV",
				seasonYear: 2025,
				coverImage: {
					medium: null,
					large: "https://img.example/linked-large.jpg",
				},
			},
		];
		const metadataSpy = vi.fn(async () => ({ metadata: linkedMetadata }));

		await expect(
			getMappingInspection(
				{ provider: "sonarr", anilistId: aid(10) },
				{
					mappingService: {
						getMapping: vi.fn(async () => ({
							kind: "mapped",
							source: "manual",
							providerId: 100,
						} as const)),
						getLinkedAniListIds: vi.fn(async () => [aid(11)]),
					},
					anilistMetadataStore: { getMetadata: metadataSpy },
				},
			),
		).resolves.toEqual({
			source: { source: "anilist", id: aid(10) },
			mapping: { kind: "mapped", source: "manual", providerId: 100 },
			linkedAniListEntries: [
				{
					anilistId: aid(10),
					title: "Current Show",
					format: "TV",
					year: 2024,
					coverImage: "https://img.example/current-medium.jpg",
					relation: "current",
				},
				{
					anilistId: aid(11),
					title: "Linked Show",
					format: "TV",
					year: 2025,
					coverImage: "https://img.example/linked-large.jpg",
				},
			],
		});
		expect(metadataSpy).toHaveBeenCalledWith([aid(10), aid(11)]);
	});

	it("skips linked metadata for non-mapped results", async () => {
		const metadataSpy = vi.fn(async () => ({ metadata: [] }));

		await expect(
			getMappingInspection(
				{ provider: "radarr", anilistId: aid(404) },
				{
					mappingService: {
						getMapping: vi.fn(async () => ({
							kind: "unmapped",
							hadResolveAttempt: false,
						} as const)),
						getLinkedAniListIds: vi.fn(),
					},
					anilistMetadataStore: { getMetadata: metadataSpy },
				},
			),
		).resolves.toEqual({
			source: { source: "anilist", id: aid(404) },
			mapping: { kind: "unmapped", hadResolveAttempt: false },
			linkedAniListEntries: [],
		});
		expect(metadataSpy).not.toHaveBeenCalled();
	});

	it("inspects MAL source identity while using optional AniList crosswalk for current relation", async () => {
		const metadataSpy = vi.fn(async () => ({
			metadata: [
				{
					id: aid(10),
					titles: { english: "Current Show" },
					format: "TV",
				},
			] satisfies AniListMetadata[],
		}));
		const source = { source: "mal", id: mal(5114) } as const;
		const getMapping = vi.fn(
			async () =>
				({
					kind: "mapped",
					source: "upstream",
					providerId: 100,
				}) as const,
		);

		await expect(
			getMappingInspection(
				{ provider: "sonarr", source, anilistId: aid(10) },
				{
					mappingService: {
						getMapping,
						getLinkedAniListIds: vi.fn(async () => []),
					},
					anilistMetadataStore: { getMetadata: metadataSpy },
				},
			),
		).resolves.toEqual({
			source,
			mapping: { kind: "mapped", source: "upstream", providerId: 100 },
			linkedAniListEntries: [
				{
					anilistId: aid(10),
					title: "Current Show",
					format: "TV",
					relation: "current",
				},
			],
		});
		expect(getMapping).toHaveBeenCalledWith("sonarr", aid(10));
		expect(getUniqueAniListIdForSource).not.toHaveBeenCalled();
	});

	it("returns unmapped for a MAL source without a crosswalk", async () => {
		vi.mocked(getUniqueAniListIdForSource).mockResolvedValue(null);
		const getMapping = vi.fn();
		const metadataSpy = vi.fn();
		const source = { source: "mal", id: mal(5114) } as const;

		await expect(
			getMappingInspection(
				{ provider: "sonarr", source },
				{
					mappingService: {
						getMapping,
						getLinkedAniListIds: vi.fn(),
					},
					anilistMetadataStore: { getMetadata: metadataSpy },
				},
			),
		).resolves.toEqual({
			source,
			mapping: { kind: "unmapped", hadResolveAttempt: false },
			linkedAniListEntries: [],
		});

		expect(getMapping).not.toHaveBeenCalled();
		expect(metadataSpy).not.toHaveBeenCalled();
	});
});
