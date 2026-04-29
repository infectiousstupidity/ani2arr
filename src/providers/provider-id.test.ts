/** Focused tests for provider ID branding boundaries. */
// src/providers/provider-id.test.ts

import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
	ProviderQualityProfileIdSchema,
	ProviderTagIdSchema,
	RadarrMovieIdSchema,
	SonarrSeriesIdSchema,
	TmdbIdSchema,
	TvdbIdSchema,
	isProviderQualityProfileId,
	isProviderTagId,
	isRadarrMovieId,
	isSonarrSeriesId,
	isTmdbId,
	isTvdbId,
	parseProviderQualityProfileId,
	parseProviderQualityProfileIdOrNull,
	parseProviderIdentity,
	parseProviderTagId,
	parseProviderTagIdOrNull,
	parseRadarrMovieId,
	parseRadarrMovieIdOrNull,
	parseSonarrSeriesId,
	parseSonarrSeriesIdOrNull,
	parseTmdbId,
	parseTmdbIdOrNull,
	parseTvdbId,
	parseTvdbIdOrNull,
	type ProviderIdFor,
	type ProviderIdentity,
	type ProviderQualityProfileId,
	type ProviderTagId,
	type RadarrMovieId,
	type SonarrSeriesId,
	type TmdbId,
	type TvdbId,
} from "./provider-id";

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

type IdCase<TId extends number> = {
	name: string;
	isId: (value: unknown) => value is TId;
	parse: (value: unknown) => TId;
	parseOrNull: (value: unknown) => TId | null;
	schema: v.GenericSchema<unknown, TId>;
};

const ID_CASES = [
	{
		name: "TVDB ID",
		isId: isTvdbId,
		parse: parseTvdbId,
		parseOrNull: parseTvdbIdOrNull,
		schema: TvdbIdSchema,
	},
	{
		name: "TMDB ID",
		isId: isTmdbId,
		parse: parseTmdbId,
		parseOrNull: parseTmdbIdOrNull,
		schema: TmdbIdSchema,
	},
	{
		name: "Sonarr series ID",
		isId: isSonarrSeriesId,
		parse: parseSonarrSeriesId,
		parseOrNull: parseSonarrSeriesIdOrNull,
		schema: SonarrSeriesIdSchema,
	},
	{
		name: "Radarr movie ID",
		isId: isRadarrMovieId,
		parse: parseRadarrMovieId,
		parseOrNull: parseRadarrMovieIdOrNull,
		schema: RadarrMovieIdSchema,
	},
	{
		name: "provider quality profile ID",
		isId: isProviderQualityProfileId,
		parse: parseProviderQualityProfileId,
		parseOrNull: parseProviderQualityProfileIdOrNull,
		schema: ProviderQualityProfileIdSchema,
	},
	{
		name: "provider tag ID",
		isId: isProviderTagId,
		parse: parseProviderTagId,
		parseOrNull: parseProviderTagIdOrNull,
		schema: ProviderTagIdSchema,
	},
] satisfies IdCase<number>[];

describe("provider ID helpers", () => {
	it.each(ID_CASES)(
		"accepts positive integer $name values",
		({ isId, parse, parseOrNull, schema }) => {
			expect(isId(123)).toBe(true);
			expect(parse(123)).toBe(123);
			expect(parseOrNull(123)).toBe(123);
			expect(v.parse(schema, 123)).toBe(123);
		},
	);

	it.each(ID_CASES)(
		"rejects invalid $name values",
		({ isId, parse, parseOrNull, schema }) => {
			for (const value of INVALID_VALUES) {
				expect(isId(value)).toBe(false);
				expect(() => parse(value)).toThrow(/Invalid .+ ID/);
				expect(parseOrNull(value)).toBeNull();
				expect(() => v.parse(schema, value)).toThrow();
			}
		},
	);

	it("keeps provider identity types provider-discriminated", () => {
		const tvdbId = parseTvdbId(100);
		const tmdbId = parseTmdbId(200);

		const sonarrIdentity = {
			provider: "sonarr",
			providerId: tvdbId,
		} satisfies ProviderIdentity;

		const radarrIdentity = {
			provider: "radarr",
			providerId: tmdbId,
		} satisfies ProviderIdentity;

		const typedTvdbId: ProviderIdFor<"sonarr"> = sonarrIdentity.providerId;
		const typedTmdbId: ProviderIdFor<"radarr"> = radarrIdentity.providerId;

		expect(typedTvdbId).toBe(100);
		expect(typedTmdbId).toBe(200);
	});

	it("parses provider identities by provider kind", () => {
		expect(parseProviderIdentity("sonarr", 100)).toEqual({
			provider: "sonarr",
			providerId: 100,
		});
		expect(parseProviderIdentity("radarr", 200)).toEqual({
			provider: "radarr",
			providerId: 200,
		});
		expect(() => parseProviderIdentity("sonarr", "100")).toThrow(
			/Invalid TVDB ID/,
		);
		expect(() => parseProviderIdentity("radarr", 0)).toThrow(/Invalid TMDB ID/);
	});
});

void (null as unknown as
	| ProviderQualityProfileId
	| ProviderTagId
	| RadarrMovieId
	| SonarrSeriesId
	| TmdbId
	| TvdbId);
