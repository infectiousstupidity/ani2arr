import { describe, expect, it, vi } from "vitest";
import {
	parseAniListId,
	type AniListId,
	type AniListMetadata,
} from "@/anilist/types";
import type { MappingResult } from "@/mapping/types";
import { getUniqueAniListIdForSource } from "@/mapping/upstream.store";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { getMappingInspection } from "./mapping-inspection";

vi.mock("@/mapping/upstream.store", () => ({
	getUniqueAniListIdForSource: vi.fn(),
}));

const aid = parseAniListId;
const mal = parseMyAnimeListId;

function inspectionDeps(
	mapping: MappingResult,
	linkedIds: AniListId[] = [],
	metadata: AniListMetadata[] = [],
) {
	return {
		mappingService: {
			getMapping: vi.fn(async () => mapping),
			getLinkedAniListIds: vi.fn(async () => linkedIds),
		},
		anilistMetadataStore: {
			getMetadata: vi.fn(async () => ({ metadata })),
		},
	};
}

describe("getMappingInspection", () => {
	it("loads linked metadata for a mapped MAL source", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
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
		const deps = inspectionDeps(
			{ kind: "mapped", source: "manual", providerId: 100 },
			[aid(11)],
			linkedMetadata,
		);

		await expect(
			getMappingInspection(
				{ provider: "sonarr", source, anilistId: aid(10) },
				deps,
			),
		).resolves.toEqual({
			source,
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
		expect(deps.mappingService.getMapping).toHaveBeenCalledWith(
			"sonarr",
			source,
		);
		expect(deps.anilistMetadataStore.getMetadata).toHaveBeenCalledWith([
			aid(10),
			aid(11),
		]);
		expect(getUniqueAniListIdForSource).not.toHaveBeenCalled();
	});

	it("skips linked metadata for non-mapped results", async () => {
		const deps = inspectionDeps({
			kind: "unmapped",
			hadResolveAttempt: false,
		});

		await expect(
			getMappingInspection({ provider: "radarr", anilistId: aid(404) }, deps),
		).resolves.toEqual({
			source: { source: "anilist", id: aid(404) },
			mapping: { kind: "unmapped", hadResolveAttempt: false },
			linkedAniListEntries: [],
		});
		expect(deps.anilistMetadataStore.getMetadata).not.toHaveBeenCalled();
	});

	it("inspects a source-native MAL mapping without a crosswalk", async () => {
		vi.mocked(getUniqueAniListIdForSource).mockResolvedValue(null);
		const source = { source: "mal", id: mal(5114) } as const;
		const deps = inspectionDeps({
			kind: "mapped",
			source: "manual",
			providerId: 424_536,
		});

		await expect(
			getMappingInspection({ provider: "sonarr", source }, deps),
		).resolves.toEqual({
			source,
			mapping: {
				kind: "mapped",
				source: "manual",
				providerId: 424_536,
			},
			linkedAniListEntries: [],
		});

		expect(deps.mappingService.getMapping).toHaveBeenCalledWith(
			"sonarr",
			source,
		);
		expect(deps.anilistMetadataStore.getMetadata).not.toHaveBeenCalled();
	});
});
