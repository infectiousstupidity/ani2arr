/** Mapping-owned Seerr target validation and season normalization. */

import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type TmdbId,
	type TvdbId,
} from "@/providers/schemas";

export type SeerrTarget =
	| { mediaType: "movie"; tmdbId: TmdbId }
	| {
			mediaType: "tv";
			tmdbId: TmdbId;
			tvdbId?: TvdbId;
			seasons?: number[];
	  };

export function normalizeSeerrSeasons(
	seasons: readonly number[],
): number[] {
	return [...new Set(seasons)]
		.filter((season) => Number.isSafeInteger(season) && season >= 0)
		.toSorted((left, right) => left - right);
}

export function normalizeSeerrTarget(
	target: SeerrTarget,
): SeerrTarget | null {
	const tmdbId = parseTmdbIdOrNull(target.tmdbId);
	if (tmdbId === null) return null;
	if (target.mediaType === "movie") return { mediaType: "movie", tmdbId };

	const tvdbId = parseTvdbIdOrNull(target.tvdbId);
	const seasons = normalizeSeerrSeasons(target.seasons ?? []);
	return {
		mediaType: "tv",
		tmdbId,
		...(tvdbId === null ? {} : { tvdbId }),
		...(seasons.length === 0 ? {} : { seasons }),
	};
}
