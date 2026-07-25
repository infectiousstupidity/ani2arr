/** Focused URL eligibility tests for MyAnimeList browse surfaces. */

import { describe, expect, it } from "vitest";
import { isBrowseSurface, isEarlyBrowseSurface } from "./surface";

describe("isEarlyBrowseSurface", () => {
	it.each([
		"https://myanimelist.net/anime/season",
		"https://myanimelist.net/anime/season?letter=A#summer",
		"https://myanimelist.net/anime/season/2026/summer",
		"https://myanimelist.net/topanime.php",
		"https://myanimelist.net/topanime.php?type=movie",
		"https://myanimelist.net/topanime.php?limit=50#ranking",
	])("accepts %s", (url) => {
		expect(isEarlyBrowseSurface(url)).toBe(true);
	});

	it.each([
		"https://myanimelist.net/anime/seasonal",
		"https://myanimelist.net/topanime.php/extra",
		"https://myanimelist.net/anime/genre/2/Adventure",
		"https://anilist.co/anime/season",
		"not a url",
	])("rejects %s", (url) => {
		expect(isEarlyBrowseSurface(url)).toBe(false);
	});
});

describe("isBrowseSurface", () => {
	it.each([
		"https://myanimelist.net/search/all",
		"https://myanimelist.net/search/all?q=frieren&cat=all",
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
