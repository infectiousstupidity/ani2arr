/** Focused URL eligibility tests for MyAnimeList browse surfaces. */

import { describe, expect, it } from "vitest";
import { isBrowseSurface } from "./surface";

describe("isBrowseSurface", () => {
	it.each([
		"https://myanimelist.net/search/all",
		"https://myanimelist.net/anime.php?cat=anime&q=frieren",
		"https://myanimelist.net/anime/season/2026/summer",
		"https://myanimelist.net/topanime.php",
	])("accepts %s", (url) => {
		expect(isBrowseSurface(url)).toBe(true);
	});

	it.each([
		"https://myanimelist.net/search/all/extra",
		"https://myanimelist.net/search/manga?q=frieren",
		"https://myanimelist.net/anime.php?id=5114",
		"https://myanimelist.net/anime/seasonal",
	])("rejects %s", (url) => {
		expect(isBrowseSurface(url)).toBe(false);
	});
});
