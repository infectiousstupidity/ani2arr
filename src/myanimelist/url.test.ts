/** Tests for MyAnimeList anime URL parsing. */
// src/myanimelist/url.test.ts

import { describe, expect, it } from "vitest";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { readMyAnimeListIdFromUrl } from "@/myanimelist/url";

describe("readMyAnimeListIdFromUrl", () => {
	it("reads pretty, query, and video anime URLs", () => {
		expect(
			readMyAnimeListIdFromUrl(
				"https://myanimelist.net/anime/5114/Fullmetal_Alchemist__Brotherhood",
			),
		).toBe(parseMyAnimeListId(5114));
		expect(readMyAnimeListIdFromUrl("/anime.php?id=5114")).toBe(
			parseMyAnimeListId(5114),
		);
		expect(
			readMyAnimeListIdFromUrl(
				"https://myanimelist.net/anime/5114/Fullmetal_Alchemist__Brotherhood/video",
			),
		).toBe(parseMyAnimeListId(5114));
	});

	it("rejects invalid anime URLs", () => {
		expect(readMyAnimeListIdFromUrl("/topanime.php")).toBeNull();
		expect(readMyAnimeListIdFromUrl("not a url")).toBeNull();
	});
});
