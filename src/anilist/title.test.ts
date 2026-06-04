/** Focused tests for AniList title and format helpers. */
// src/anilist/title.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListMediaFormatLabel } from "@/anilist/types";
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

	it("parses risky browse format labels", () => {
		expect(parseAniListMediaFormatLabel("TV Show")).toBe("TV");
		expect(parseAniListMediaFormatLabel("TV Short")).toBe("TV_SHORT");
		expect(parseAniListMediaFormatLabel("Movies")).toBe("MOVIE");
		expect(parseAniListMediaFormatLabel("OVA / ONA / SPECIAL")).toBe("SPECIAL");
	});
});
