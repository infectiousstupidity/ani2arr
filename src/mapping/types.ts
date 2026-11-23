/** Mapping target and resolved mapping result types. */

import {
	parseTmdbIdOrNull,
	type TmdbId,
	type TvdbId,
} from "@/providers/schemas";
import { normalizeSeasonNumbers } from "./season-numbers";

export type SeerrTarget =
	| { mediaType: "movie"; tmdbId: TmdbId }
	| {
			mediaType: "tv";
			tmdbId: TmdbId;
			seasons?: number[];
	  };

export function normalizeSeerrTarget(target: unknown): SeerrTarget | null {
	return normalizeSeerrTargetWithSeasonField(target, "seasons");
}

export function normalizeLegacySeerrTarget(
	target: unknown,
): SeerrTarget | null {
	return normalizeSeerrTargetWithSeasonField(target, "tmdbSeasons");
}

function normalizeSeerrTargetWithSeasonField(
	target: unknown,
	seasonField: "seasons" | "tmdbSeasons",
): SeerrTarget | null {
	if (typeof target !== "object" || target === null) return null;
	const value = target as Record<string, unknown>;
	if (value.mediaType !== "movie" && value.mediaType !== "tv") return null;
	const tmdbId = parseTmdbIdOrNull(value.tmdbId);
	if (tmdbId === null) return null;
	if (value.mediaType === "movie") return { mediaType: "movie", tmdbId };

	const rawSeasons = value[seasonField];
	if (
		rawSeasons !== undefined &&
		(!Array.isArray(rawSeasons) ||
			rawSeasons.some((season) => !Number.isSafeInteger(season) || season < 0))
	)
		return null;
	const seasons = normalizeSeasonNumbers(
		(rawSeasons as readonly number[] | undefined) ?? [],
	);
	return {
		mediaType: "tv",
		tmdbId,
		...(seasons.length === 0 ? {} : { seasons }),
	};
}

export type SeerrTargetWithEvidence = SeerrTarget;

export type ArrUpstreamTarget =
	| { provider: "sonarr"; providerId: TvdbId; season?: number }
	| { provider: "radarr"; providerId: TmdbId };

export type AutoResult =
	| {
			kind: "mapped";
			providerId: number;
			season?: number;
			matchedTitle?: string;
	  }
	| { kind: "unmapped" };

export type MappingSource = "manual" | "upstream" | "auto";

export type MappingResult =
	| {
			kind: "mapped";
			source: MappingSource;
			providerId: number;
			season?: number;
			matchedTitle?: string;
	  }
	| { kind: "ignored" }
	| { kind: "ambiguous"; targets: ArrUpstreamTarget[] }
	| {
			kind: "unmapped";
			hadResolveAttempt: boolean;
			rejectedProviderIds?: number[];
	  };
