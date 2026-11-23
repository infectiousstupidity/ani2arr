/** Direct runtime checks for mapping RPC trust boundaries. */

import { parseAniListIdOrNull } from "@/anilist/types";
import {
	parseSourceIdentityKey,
	type SourceIdentity,
} from "@/mapping/source-identity";
import { parseTmdbIdOrNull, parseTvdbIdOrNull } from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import { createError } from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";

export function requireSourceIdentity(value: unknown): SourceIdentity {
	if (!isObject(value)) invalid("Invalid mapping source.");
	const source = parseSourceIdentityKey(
		`${String(value.source)}:${String(value.id)}`,
	);
	if (!source || source.source !== value.source || source.id !== value.id) {
		invalid("Invalid mapping source.");
	}
	return source;
}

export function requireProvider(value: unknown): Provider {
	if (value !== "sonarr" && value !== "radarr") {
		invalid("Invalid mapping provider.");
	}
	return value;
}

export function requireMediaType(value: unknown): "movie" | "tv" {
	if (value !== "movie" && value !== "tv") invalid("Invalid media type.");
	return value;
}

export function requireAniListId(value: unknown) {
	const id = parseAniListIdOrNull(value);
	if (id === null) invalid("Invalid AniList ID.");
	return id;
}

export function requireProviderId(provider: Provider, value: unknown) {
	const id =
		provider === "sonarr" ? parseTvdbIdOrNull(value) : parseTmdbIdOrNull(value);
	if (id === null) invalid("Invalid provider ID.");
	return id;
}

export function requireTmdbId(value: unknown) {
	const id = parseTmdbIdOrNull(value);
	if (id === null) invalid("Invalid TMDB ID.");
	return id;
}

export function requireTvdbId(value: unknown) {
	const id = parseTvdbIdOrNull(value);
	if (id === null) invalid("Invalid TVDB ID.");
	return id;
}

export function requireSeasons(value: unknown): number[] {
	if (
		!Array.isArray(value) ||
		value.some((season) => !Number.isSafeInteger(season) || season < 0)
	) {
		invalid("Invalid season numbers.");
	}
	return value;
}

export function requireSeerrSeasons(value: unknown): "all" | number[] {
	return value === "all" ? value : requireSeasons(value);
}

function invalid(message: string): never {
	throw createError(ErrorCode.VALIDATION_ERROR, message, message);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
