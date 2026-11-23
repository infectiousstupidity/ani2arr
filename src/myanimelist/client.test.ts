/** Pure Jikan response normalization regression test. */

import { describe, expect, it } from "vitest";
import { parseJikanAnimeResponse } from "./client";

describe("parseJikanAnimeResponse", () => {
	it("normalizes the MAL anime metadata used by matching and modals", () => {
		const metadata = parseJikanAnimeResponse({
			data: {
				mal_id: 52_991,
				title: "Sousou no Frieren",
				title_english: "Frieren: Beyond Journey's End",
				title_japanese: "葬送のフリーレン",
				title_synonyms: ["Frieren at the Funeral", "  Frieren  "],
				type: "TV",
				year: null,
				aired: { from: "2023-09-29T00:00:00+00:00" },
				episodes: 28,
				status: "Finished Airing",
				synopsis: "  The adventure is over, but life goes on.  ",
				images: {
					jpg: {
						image_url: "https://cdn.myanimelist.net/images/anime/1015/138006.jpg",
						small_image_url:
							"https://cdn.myanimelist.net/images/anime/1015/138006t.jpg",
						large_image_url:
							"https://cdn.myanimelist.net/images/anime/1015/138006l.jpg",
					},
				},
			},
		});

		expect(metadata).toMatchObject({
			id: 52_991,
			titles: {
				romaji: "Sousou no Frieren",
				english: "Frieren: Beyond Journey's End",
				native: "葬送のフリーレン",
			},
			synonyms: ["Frieren at the Funeral", "Frieren"],
			format: "TV",
			year: 2023,
			episodes: 28,
			status: "Finished Airing",
			synopsis: "The adventure is over, but life goes on.",
			coverImage: {
				large: "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg",
				medium: "https://cdn.myanimelist.net/images/anime/1015/138006.jpg",
				small: "https://cdn.myanimelist.net/images/anime/1015/138006t.jpg",
			},
			bannerImage: null,
		});
	});
});
