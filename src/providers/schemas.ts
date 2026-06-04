/** Branded provider-domain IDs, minimal parsers, and schemas. */
// src/providers/schemas.ts

import * as v from "valibot";
import type { Brand } from "@/shared/types/brand";

export type TvdbId = Brand<number, "TvdbId">;
export type TmdbId = Brand<number, "TmdbId">;

export type SonarrSeriesId = Brand<number, "SonarrSeriesId">;
export type RadarrMovieId = Brand<number, "RadarrMovieId">;

export type ProviderQualityProfileId = Brand<
	number,
	"ProviderQualityProfileId"
>;
export type ProviderTagId = Brand<number, "ProviderTagId">;

function createPositiveIntegerIdSchema<TId extends number>(): v.GenericSchema<
	unknown,
	TId
> {
	return v.pipe(
		v.number(),
		v.finite(),
		v.integer(),
		v.minValue(1),
		v.transform((value): TId => value as TId),
	);
}

function parseIdOrNull<TId extends number>(
	schema: v.GenericSchema<unknown, TId>,
	value: unknown,
): TId | null {
	const result = v.safeParse(schema, value);
	return result.success ? result.output : null;
}

function parseId<TId extends number>(
	schema: v.GenericSchema<unknown, TId>,
	value: unknown,
	label: string,
): TId {
	const id = parseIdOrNull(schema, value);
	if (id === null) {
		throw new Error(`Invalid ${label} ID`);
	}
	return id;
}

export const TvdbIdSchema = createPositiveIntegerIdSchema<TvdbId>();

export function parseTvdbId(value: unknown): TvdbId {
	return parseId(TvdbIdSchema, value, "TVDB");
}

export function parseTvdbIdOrNull(value: unknown): TvdbId | null {
	return parseIdOrNull(TvdbIdSchema, value);
}

export const TmdbIdSchema = createPositiveIntegerIdSchema<TmdbId>();

export function parseTmdbId(value: unknown): TmdbId {
	return parseId(TmdbIdSchema, value, "TMDB");
}

export function parseTmdbIdOrNull(value: unknown): TmdbId | null {
	return parseIdOrNull(TmdbIdSchema, value);
}

export const SonarrSeriesIdSchema =
	createPositiveIntegerIdSchema<SonarrSeriesId>();

export const RadarrMovieIdSchema =
	createPositiveIntegerIdSchema<RadarrMovieId>();

export const ProviderQualityProfileIdSchema =
	createPositiveIntegerIdSchema<ProviderQualityProfileId>();

export const ProviderTagIdSchema =
	createPositiveIntegerIdSchema<ProviderTagId>();
