/** Tests for MyAnimeList browse-shell URL eligibility. */
// src/content/myanimelist/browse/index.test.ts

import { describe, expect, it } from "vitest";
import { isBrowseSurface } from "./surface";

describe("isBrowseSurface", () => {
	it("excludes legacy anime detail URLs from browse surfaces", () => {
		expect(isBrowseSurface("https://myanimelist.net/anime.php?id=5114")).toBe(
			false,
		);
		expect(isBrowseSurface("https://myanimelist.net/anime.php?q=mushishi")).toBe(
			true,
		);
	});

	it("matches browse path segments exactly", () => {
		expect(isBrowseSurface("https://myanimelist.net/anime/season/2026/summer")).toBe(
			true,
		);
		expect(isBrowseSurface("https://myanimelist.net/anime/seasonal")).toBe(
			false,
		);
	});
});
