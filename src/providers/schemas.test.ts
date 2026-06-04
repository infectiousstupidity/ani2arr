/** Focused tests for provider ID schema boundaries. */
// src/providers/schemas.test.ts

import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
	ProviderQualityProfileIdSchema,
	ProviderTagIdSchema,
	RadarrMovieIdSchema,
	SonarrSeriesIdSchema,
	TmdbIdSchema,
	parseTmdbId,
	parseTmdbIdOrNull,
	parseTvdbId,
	parseTvdbIdOrNull,
	TvdbIdSchema,
	type TmdbId,
	type TvdbId,
} from "./schemas";

describe("provider ID helpers", () => {
	it("parses concrete provider external IDs", () => {
		const tvdbId: TvdbId = parseTvdbId(100);
		const tmdbId: TmdbId = parseTmdbId(200);

		expect(tvdbId).toBe(100);
		expect(tmdbId).toBe(200);
	});

	it("rejects invalid concrete provider external IDs", () => {
		expect(parseTvdbIdOrNull("100")).toBeNull();
		expect(parseTmdbIdOrNull(0)).toBeNull();
		expect(() => parseTvdbId(1.5)).toThrow(/Invalid TVDB ID/);
		expect(() => parseTmdbId("200")).toThrow(/Invalid TMDB ID/);
	});

	it("rejects invalid numeric IDs at schema boundaries", () => {
		for (const schema of [
			TvdbIdSchema,
			TmdbIdSchema,
			SonarrSeriesIdSchema,
			RadarrMovieIdSchema,
			ProviderQualityProfileIdSchema,
			ProviderTagIdSchema,
		]) {
			expect(() => v.parse(schema, 0)).toThrow();
			expect(() => v.parse(schema, 1.5)).toThrow();
		}
	});
});
