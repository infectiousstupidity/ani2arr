/** Tests for mapping query helper behavior around source crosswalk refreshes. */
// src/queries/mapping.test.ts

import { describe, expect, it, vi } from "vitest";
import type { AniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { getSourceAniListIdMap } from "@/queries/mapping";

const aid = (value: number): AniListId => value as AniListId;

describe("getSourceAniListIdMap", () => {
	it("refreshes upstream mappings once when a MAL crosswalk is missing", async () => {
		const malSource = { source: "mal", id: parseMyAnimeListId(5114) } as const;
		const getAniListIdForSource = vi
			.fn()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(aid(21));
		const refreshMappingPipeline = vi.fn(async () => {});

		await expect(
			getSourceAniListIdMap(
				{ getAniListIdForSource, refreshMappingPipeline },
				[malSource],
			),
		).resolves.toEqual({ "mal:5114": aid(21) });

		expect(refreshMappingPipeline).toHaveBeenCalledTimes(1);
		expect(getAniListIdForSource).toHaveBeenCalledTimes(2);
	});

	it("does not refresh when only AniList sources are requested", async () => {
		const getAniListIdForSource = vi.fn(async () => aid(21));
		const refreshMappingPipeline = vi.fn(async () => {});

		await expect(
			getSourceAniListIdMap(
				{ getAniListIdForSource, refreshMappingPipeline },
				[{ source: "anilist", id: aid(21) }],
			),
		).resolves.toEqual({ "anilist:21": aid(21) });

		expect(refreshMappingPipeline).not.toHaveBeenCalled();
	});
});
