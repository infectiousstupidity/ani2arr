/** Focused tests for AniList ID branding boundaries. */
// src/anilist/anilist-id.test.ts

import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
	AniListIdSchema,
	isAniListId,
	parseAniListId,
	parseAniListIdOrNull,
} from "./anilist-id";

const INVALID_VALUES = [
	0,
	-1,
	1.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	"123",
	null,
	undefined,
] as const;

describe("AniList ID helpers", () => {
	it("accepts positive integers", () => {
		expect(isAniListId(123)).toBe(true);
		expect(parseAniListId(123)).toBe(123);
		expect(parseAniListIdOrNull(123)).toBe(123);
		expect(v.parse(AniListIdSchema, 123)).toBe(123);
	});

	it("rejects invalid values", () => {
		for (const value of INVALID_VALUES) {
			expect(isAniListId(value)).toBe(false);
			expect(() => parseAniListId(value)).toThrow("Invalid AniList ID");
			expect(parseAniListIdOrNull(value)).toBeNull();
			expect(() => v.parse(AniListIdSchema, value)).toThrow();
		}
	});
});
