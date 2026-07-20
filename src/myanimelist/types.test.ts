/** Tests for MyAnimeList identifier parsing. */
// src/myanimelist/types.test.ts

import { describe, expect, it } from "vitest";
import {
	parseMyAnimeListId,
	parseMyAnimeListIdOrNull,
} from "@/myanimelist/types";

describe("parseMyAnimeListIdOrNull", () => {
	it("accepts positive integer numbers", () => {
		expect(parseMyAnimeListIdOrNull(5114)).toBe(5114);
	});

	it("rejects non-number and invalid numeric values", () => {
		expect(parseMyAnimeListIdOrNull("5114")).toBeNull();
		expect(parseMyAnimeListIdOrNull(0)).toBeNull();
		expect(parseMyAnimeListIdOrNull(-1)).toBeNull();
		expect(parseMyAnimeListIdOrNull(1.5)).toBeNull();
		expect(parseMyAnimeListIdOrNull(Number.NaN)).toBeNull();
		expect(parseMyAnimeListIdOrNull(Number.POSITIVE_INFINITY)).toBeNull();
	});
});

describe("parseMyAnimeListId", () => {
	it("throws for invalid values", () => {
		expect(() => parseMyAnimeListId("5114")).toThrow(
			"Invalid MyAnimeList ID",
		);
	});
});
