/** Tests for MyAnimeList anime URL parsing. */
// src/myanimelist/url.test.ts

import { describe, expect, it } from "vitest";
import { parseMyAnimeListId } from "@/myanimelist/types";
import {
	buildMyAnimeListAnimeUrl,
	readMyAnimeListIdFromUrl,
	toMyAnimeListPosterUrl,
} from "@/myanimelist/url";

it("converts MAL CDN thumbnails to the full-size poster", () => {
	const full = "https://cdn.myanimelist.net/images/anime/1015/138006.jpg";
	expect(
		toMyAnimeListPosterUrl(
			"https://cdn.myanimelist.net/r/50x70/images/anime/1015/138006.jpg?s=09c2f2dec5891d8e8fbb9fa3b23c75b4",
		),
	).toBe(full);
	expect(toMyAnimeListPosterUrl(full)).toBe(full);
	expect(toMyAnimeListPosterUrl("data:image/gif;base64,R0lGOD")).toBeNull();
	expect(toMyAnimeListPosterUrl("/images/anime/1.jpg")).toBeNull();
});

it("builds an anime URL", () => {
	expect(buildMyAnimeListAnimeUrl(parseMyAnimeListId(5114))).toBe(
		"https://myanimelist.net/anime/5114",
	);
});

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
