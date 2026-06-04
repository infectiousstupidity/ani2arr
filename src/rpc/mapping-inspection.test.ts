/** Tests for RPC mapping inspection payload composition. */
// src/rpc/mapping-inspection.test.ts

import { describe, expect, it, vi } from "vitest";
import { parseAniListId, type AniListMetadata } from "@/anilist/types";
import { getMappingInspection } from "./mapping-inspection";

const aid = parseAniListId;

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
			mapping: { kind: "unmapped", hadResolveAttempt: false },
			linkedAniListEntries: [],
		});
		expect(metadataSpy).not.toHaveBeenCalled();
	});
});
