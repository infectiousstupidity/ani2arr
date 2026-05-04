/** Branded provider-domain IDs, validators, and schemas. */
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

function isPositiveIntegerId(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isFinite(value) &&
		Number.isInteger(value) &&
		value > 0
	);
}

function parsePositiveIntegerId<TId extends number>(
	value: unknown,
	isId: (candidate: unknown) => candidate is TId,
	label: string,
): TId {
	if (!isId(value)) {
		throw new Error(`Invalid ${label} ID`);
	}
	return value;
}

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

export function isTvdbId(value: unknown): value is TvdbId {
	return isPositiveIntegerId(value);
}

export function parseTvdbId(value: unknown): TvdbId {
	return parsePositiveIntegerId(value, isTvdbId, "TVDB");
}

export function parseTvdbIdOrNull(value: unknown): TvdbId | null {
	return isTvdbId(value) ? value : null;
}

export const TvdbIdSchema = createPositiveIntegerIdSchema<TvdbId>();

export function isTmdbId(value: unknown): value is TmdbId {
	return isPositiveIntegerId(value);
}

export function parseTmdbId(value: unknown): TmdbId {
	return parsePositiveIntegerId(value, isTmdbId, "TMDB");
}

export function parseTmdbIdOrNull(value: unknown): TmdbId | null {
	return isTmdbId(value) ? value : null;
}

export const TmdbIdSchema = createPositiveIntegerIdSchema<TmdbId>();

export function isSonarrSeriesId(value: unknown): value is SonarrSeriesId {
	return isPositiveIntegerId(value);
}

export function parseSonarrSeriesId(value: unknown): SonarrSeriesId {
	return parsePositiveIntegerId(value, isSonarrSeriesId, "Sonarr series");
}

export function parseSonarrSeriesIdOrNull(
	value: unknown,
): SonarrSeriesId | null {
	return isSonarrSeriesId(value) ? value : null;
}

export const SonarrSeriesIdSchema =
	createPositiveIntegerIdSchema<SonarrSeriesId>();

export function isRadarrMovieId(value: unknown): value is RadarrMovieId {
	return isPositiveIntegerId(value);
}

export function parseRadarrMovieId(value: unknown): RadarrMovieId {
	return parsePositiveIntegerId(value, isRadarrMovieId, "Radarr movie");
}

export function parseRadarrMovieIdOrNull(value: unknown): RadarrMovieId | null {
	return isRadarrMovieId(value) ? value : null;
}

export const RadarrMovieIdSchema =
	createPositiveIntegerIdSchema<RadarrMovieId>();

export function isProviderQualityProfileId(
	value: unknown,
): value is ProviderQualityProfileId {
	return isPositiveIntegerId(value);
}

export function parseProviderQualityProfileId(
	value: unknown,
): ProviderQualityProfileId {
	return parsePositiveIntegerId(
		value,
		isProviderQualityProfileId,
		"provider quality profile",
	);
}

export function parseProviderQualityProfileIdOrNull(
	value: unknown,
): ProviderQualityProfileId | null {
	return isProviderQualityProfileId(value) ? value : null;
}

export const ProviderQualityProfileIdSchema =
	createPositiveIntegerIdSchema<ProviderQualityProfileId>();

export function isProviderTagId(value: unknown): value is ProviderTagId {
	return isPositiveIntegerId(value);
}

export function parseProviderTagId(value: unknown): ProviderTagId {
	return parsePositiveIntegerId(value, isProviderTagId, "provider tag");
}

export function parseProviderTagIdOrNull(value: unknown): ProviderTagId | null {
	return isProviderTagId(value) ? value : null;
}

export const ProviderTagIdSchema =
	createPositiveIntegerIdSchema<ProviderTagId>();
