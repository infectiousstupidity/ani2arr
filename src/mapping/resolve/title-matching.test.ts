/** Tests for provider-aware automatic mapping title normalization and scoring. */
// src/mapping/resolve/title-matching.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId, type AniListMedia } from "@/anilist/types";
import {
	canonicalTitleKeyForProvider,
	findTitleMatchForTerm,
	getSearchTerms,
	sanitizeLookupDisplayForProvider,
	type TitleCandidate,
} from "./title-matching";

function media(title: string): AniListMedia {
	return {
		id: parseAniListId(1),
		format: "TV",
		title: { romaji: title },
		synonyms: [],
	};
}

function firstSonarrTerm(title: string) {
	const term = getSearchTerms("sonarr", media(title))[0];
	if (!term) throw new Error(`No term for ${title}`);
	return term;
}

function matchSonarr(title: string, candidates: TitleCandidate[]) {
	return findTitleMatchForTerm(
		"sonarr",
		firstSonarrTerm(title),
		undefined,
		candidates,
	);
}

describe("title matching", () => {
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
			sanitizeLookupDisplayForProvider(
				"sonarr",
				"Kusuriya no Hitorigoto 3rd Season Part 2",
			),
		).toBe("Kusuriya no Hitorigoto");
		expect(sanitizeLookupDisplayForProvider("sonarr", "Some Show Cour II")).toBe(
			"Some Show",
		);
		expect(sanitizeLookupDisplayForProvider("sonarr", "Some Show S2")).toBe(
			"Some Show",
		);
	});

	it("preserves Sonarr reboot years while cleaning season suffixes", () => {
		expect(
			sanitizeLookupDisplayForProvider(
				"sonarr",
				"Ranma 1/2 (2024) 3rd Season",
			),
		).toBe("Ranma 1/2 2024");
		expect(
			sanitizeLookupDisplayForProvider(
				"sonarr",
				"Ranma1/2 (2024) Season 3",
			),
		).toBe("Ranma1/2 2024");
	});

	it("keeps Radarr movie-style part suffixes", () => {
		expect(sanitizeLookupDisplayForProvider("radarr", "Movie Title Part 2")).toBe(
			"Movie Title Part 2",
		);
	});

	it("deduplicates canonical provider title keys", () => {
		const terms = getSearchTerms("sonarr", {
			id: parseAniListId(1),
			format: "TV",
			title: { english: "One-Punch Man", romaji: "One Punch Man" },
			synonyms: ["One Punch Man!"],
		});

		expect(terms).toEqual([{ canonical: "one punch man", display: "One-Punch Man" }]);
		expect(canonicalTitleKeyForProvider("sonarr", "One Punch Man!")).toBe(
			"one punch man",
		);
	});

	it("matches compact title variants without AniList fallback", () => {
		expect(
			matchSonarr("Dandadan 3rd Season", [
				{ providerId: 432_832, title: "DAN DA DAN", year: 2024 },
			]),
		).toEqual({ providerId: 432_832, matchedTitle: "Dandadan" });
	});

	it("matches hyphenated titles after Sonarr season cleanup", () => {
		expect(
			matchSonarr("One Punch Man 3 Part 2", [
				{ providerId: 293_088, title: "One-Punch Man", year: 2015 },
			]),
		).toEqual({ providerId: 293_088, matchedTitle: "One Punch Man" });
	});

	it("matches short sequel prefix titles after Sonarr cleanup", () => {
		expect(
			matchSonarr("GATE 2: Jieitai Kano Umi nite, Kaku Tatakaeri", [
				{ providerId: 295_222, title: "GATE", year: 2015 },
			]),
		).toEqual({ providerId: 295_222, matchedTitle: "GATE" });
	});

	it("uses alternate titles to avoid picking the live-action Yuru Camp result", () => {
		expect(
			matchSonarr("Yuru Camp△ SEASON 4", [
				{ providerId: 377_094, title: "Laid-Back Camp (2020)", year: 2020 },
				{
					providerId: 330_692,
					title: "Laid-Back Camp",
					alternateTitles: ["Yuru Camp△"],
					year: 2018,
				},
			]),
		).toEqual({ providerId: 330_692, matchedTitle: "Yuru Camp△" });
	});

	it("prefers the Ranma 2024 reboot over the original Sonarr result", () => {
		const term = firstSonarrTerm("Ranma 1/2 (2024) 3rd Season");

		expect(
			findTitleMatchForTerm("sonarr", term, 2026, [
				{ providerId: 76_932, title: "Ranma 1/2", year: 1989 },
				{ providerId: 451_479, title: "Ranma 1/2 (2024)", year: 2024 },
			]),
		).toEqual({ providerId: 451_479, matchedTitle: "Ranma 1/2 2024" });
	});

	it("does not accept weak Haikyuu figure-animation result", () => {
		expect(
			matchSonarr("Haikyuu!!: Bakemono-tachi no Iku Tokoro", [
				{ providerId: 460_412, title: "Haikyuu!! Figure Animation", year: 2020 },
			]),
		).toBeNull();
	});
});
