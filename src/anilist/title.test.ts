import {
	parseAnimeFormat,
	parseAnimeFormatLabel,
} from "@/shared/types/anime-format";
/** Focused tests for AniList title and format helpers. */
// src/anilist/title.test.ts

import { describe, expect, it } from "vitest";

import { resolveTitlePreference } from "./title";

describe("AniList title helpers", () => {
	it("uses preferred title, then English/Romaji/Native, then fallback", () => {
		expect(
			resolveTitlePreference({
				titles: { english: "English", romaji: "Romaji" },
				preferred: "romaji",
			}).primary,
		).toBe("Romaji");
		expect(resolveTitlePreference({ fallback: "Fallback" }).primary).toBe(
			"Fallback",
		);
	});

	it("normalizes supported anime formats and source labels", () => {
		expect(parseAnimeFormat(" movie ")).toBe("MOVIE");
		expect(parseAnimeFormat("MANGA")).toBeNull();
		expect(parseAnimeFormatLabel("TV Show")).toBe("TV");
		expect(parseAnimeFormatLabel("TV Short")).toBe("TV_SHORT");
		expect(parseAnimeFormatLabel("Movies")).toBe("MOVIE");
		expect(parseAnimeFormatLabel("OVA / ONA / SPECIAL")).toBe("SPECIAL");
	});
});
