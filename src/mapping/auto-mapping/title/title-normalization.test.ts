// src/mapping/auto-mapping/title/title-normalization.test.ts

import { describe, expect, it } from "vitest";
import {
	canonicalTitleKeyForProvider,
	sanitizeLookupDisplayForProvider,
} from "./title-normalization";
import { makeTitleSearchTerm, makeTitleSearchTerms } from "./title-search";

describe("title normalization", () => {
	it("sanitizes Sonarr lookup titles with suffix-only season cleanup", () => {
		expect(
			sanitizeLookupDisplayForProvider("sonarr", "[Oshi no Ko] 3rd Season"),
		).toBe("Oshi no Ko");
		expect(
			sanitizeLookupDisplayForProvider(
				"sonarr",
				"Attack on Titan Final Season",
			),
		).toBe("Attack on Titan");
		expect(
			sanitizeLookupDisplayForProvider(
				"sonarr",
				"Bleach: Thousand-Year Blood War Part 2",
			),
		).toBe("Bleach: Thousand-Year Blood War");
		expect(
			sanitizeLookupDisplayForProvider("sonarr", "Some Show Cour II"),
		).toBe("Some Show");
		expect(sanitizeLookupDisplayForProvider("sonarr", "Some Show S2")).toBe(
			"Some Show",
		);
	});

	it("does not strip non-suffix title words from Sonarr lookup titles", () => {
		expect(sanitizeLookupDisplayForProvider("sonarr", "Final Space")).toBe(
			"Final Space",
		);
		expect(sanitizeLookupDisplayForProvider("sonarr", "The Final")).toBe(
			"The Final",
		);
		expect(
			sanitizeLookupDisplayForProvider(
				"sonarr",
				"A Certain Scientific Railgun T",
			),
		).toBe("A Certain Scientific Railgun T");
		expect(
			sanitizeLookupDisplayForProvider(
				"sonarr",
				"Some Title Part of Something",
			),
		).toBe("Some Title Part of Something");
	});

	it("sanitizes Radarr lookup titles without Sonarr season cleanup", () => {
		expect(
			sanitizeLookupDisplayForProvider("radarr", "Movie Title (2024)"),
		).toBe("Movie Title");
		expect(sanitizeLookupDisplayForProvider("radarr", "[Movie Title]")).toBe(
			"Movie Title",
		);
	});

	it("builds canonical provider title keys from sanitized titles", () => {
		expect(canonicalTitleKeyForProvider("sonarr", "One-Punch Man")).toBe(
			"one punch man",
		);
		expect(canonicalTitleKeyForProvider("sonarr", "GATE (2015)")).toBe("gate");
		expect(
			canonicalTitleKeyForProvider("sonarr", "Attack on Titan Final Season"),
		).toBe("attack on titan");
	});

	it("builds searchable title terms and rejects empty or season-only titles", () => {
		expect(makeTitleSearchTerm("sonarr", "Attack on Titan Final Season")).toEqual(
			{
				canonical: "attack on titan",
				display: "Attack on Titan",
			},
		);
		expect(makeTitleSearchTerm("sonarr", "Season 3")).toBeUndefined();
		expect(makeTitleSearchTerm("sonarr", "!!!")).toBeUndefined();
	});

	it("keeps Radarr title search terms free of Sonarr season cleanup", () => {
		expect(makeTitleSearchTerm("radarr", "Movie Title Part 2")).toEqual({
			canonical: "movie title part 2",
			display: "Movie Title Part 2",
		});
	});

	it("builds title search terms in title priority order", () => {
		expect(
			makeTitleSearchTerms(
				"sonarr",
				{
					english: "English Title",
					romaji: "Romaji Title",
					native: "Native Title",
				},
				["First Synonym", "Second Synonym"],
			).map((term) => term.display),
		).toEqual([
			"English Title",
			"Romaji Title",
			"Native Title",
			"First Synonym",
			"Second Synonym",
		]);
	});

	it("uses stripped parenthetical title variants without duplicating canonical keys", () => {
		expect(
				makeTitleSearchTerms(
					"radarr",
					{ english: "Movie Title (2024)", romaji: "Other Title" },
				),
		).toEqual([
			{ canonical: "movie title", display: "Movie Title" },
			{ canonical: "other title", display: "Other Title" },
		]);
	});

	it("deduplicates title search terms by canonical title key", () => {
		expect(
			makeTitleSearchTerms(
				"sonarr",
				{ english: "One-Punch Man", romaji: "One Punch Man" },
				["One Punch Man!"],
			),
		).toEqual([{ canonical: "one punch man", display: "One-Punch Man" }]);
	});
});
