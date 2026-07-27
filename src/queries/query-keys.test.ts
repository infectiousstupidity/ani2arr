/** Critical React Query cache identity tests. */
// src/queries/query-keys.test.ts

import { describe, expect, it } from "vitest";
import { type AniListId, parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId } from "@/providers/schemas";
import { normalizeMetadataIds, queryKeys } from "./query-keys";

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;

describe("query keys", () => {
	it("keeps MAL and AniList provider-status caches separate", () => {
		const malSource = {
			source: "mal",
			id: mal(5114),
		} as const;

		const itemKey = queryKeys.providerMediaStatusItem("sonarr", malSource);
		const malKey = queryKeys.providerMediaStatus("sonarr", {
			source: malSource,
			title: "Fullmetal Alchemist",
		});
		const anilistKey = queryKeys.providerMediaStatus("sonarr", {
			anilistId: aid(5114),
			title: "Fullmetal Alchemist",
		});

		expect(malKey.slice(0, itemKey.length)).toEqual(itemKey);
		expect(malKey).not.toEqual(anilistKey);
	});

	it("normalizes unordered batch IDs and Seerr seasons", () => {
		expect(
			normalizeMetadataIds([aid(3), aid(1), aid(3), -1 as AniListId]),
		).toEqual([aid(1), aid(3)]);

		expect(
			queryKeys.seerrMediaStatus({
				mediaType: "tv",
				tmdbId: tmdb(10),
				seasons: [2, 1, 2],
			}),
		).toEqual(
			queryKeys.seerrMediaStatus({
				mediaType: "tv",
				tmdbId: tmdb(10),
				seasons: [1, 2],
			}),
		);
	});
});
