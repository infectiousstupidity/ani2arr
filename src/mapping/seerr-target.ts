/** Mapping-owned Seerr target validation and season normalization. */

import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type TmdbId,
	type TvdbId,
} from "@/providers/schemas";
import type { AniListMediaFormat } from "@/anilist/types";
import {
	type ExternalIdLayers,
	type ExternalIdSource,
	selectExternalIdFacts,
	selectTvShowEvidence,
} from "./external-id-facts";
import { normalizeSeasonNumbers } from "./season-numbers";

export type SeerrTarget =
	| { mediaType: "movie"; tmdbId: TmdbId }
	| {
			mediaType: "tv";
			tmdbId: TmdbId;
			tvdbId?: TvdbId;
			seasons?: number[];
		  };

export type SeerrTargetWithEvidence =
	| Extract<SeerrTarget, { mediaType: "movie" }>
	| (Extract<SeerrTarget, { mediaType: "tv" }> & {
			tmdbSeasons?: number[];
			tvdbSeasons?: number[];
	  });

export type SeerrTargetProjection =
	| { kind: "missing" }
	| { kind: "conflict" }
	| {
			kind: "target";
			source: ExternalIdSource;
			target: SeerrTargetWithEvidence;
		  };

const SEERR_TV_FORMATS = new Set<AniListMediaFormat>([
	"TV",
	"TV_SHORT",
	"SPECIAL",
	"OVA",
	"ONA",
	"MUSIC",
]);

export function seerrMediaTypeFromAniListFormat(
	format: AniListMediaFormat | null | undefined,
): "movie" | "tv" | null {
	if (format === "MOVIE") return "movie";
	return format && SEERR_TV_FORMATS.has(format) ? "tv" : null;
}

export function projectSeerrTarget(
	layers: ExternalIdLayers,
	mediaType?: "movie" | "tv",
): SeerrTargetProjection {
	const selected = selectExternalIdFacts(layers);
	const hasMovie =
		selected.facts.tmdbMovie !== undefined ||
		selected.conflicts?.tmdbMovie !== undefined;
	const hasTv =
		selected.facts.tmdbShow !== undefined ||
		selected.conflicts?.tmdbShow !== undefined;

	if (mediaType === undefined) {
		if (hasMovie && hasTv) return { kind: "conflict" };
		if (hasMovie) return projectSeerrMovie(selected);
		if (hasTv) return projectSeerrTv(layers, selected);
		return { kind: "missing" };
	}

	return mediaType === "movie"
		? projectSeerrMovie(selected)
		: projectSeerrTv(layers, selected);
}

export function normalizeSeerrTarget(
	target: SeerrTarget,
): SeerrTarget | null {
	const tmdbId = parseTmdbIdOrNull(target.tmdbId);
	if (tmdbId === null) return null;
	if (target.mediaType === "movie") return { mediaType: "movie", tmdbId };

	const tvdbId = parseTvdbIdOrNull(target.tvdbId);
	const seasons = normalizeSeasonNumbers(target.seasons ?? []);
	return {
		mediaType: "tv",
		tmdbId,
		...(tvdbId === null ? {} : { tvdbId }),
		...(seasons.length === 0 ? {} : { seasons }),
	};
}

function projectSeerrMovie(
	selected: ReturnType<typeof selectExternalIdFacts>,
): SeerrTargetProjection {
	if (selected.conflicts?.tmdbMovie) {
		return { kind: "conflict" };
	}

	const tmdbId = selected.facts.tmdbMovie;
	const source = selected.sources.tmdbMovie;
	return tmdbId === undefined || source === undefined
		? { kind: "missing" }
		: {
				kind: "target",
				source,
				target: { mediaType: "movie", tmdbId },
			};
}

function projectSeerrTv(
	layers: ExternalIdLayers,
	selected: ReturnType<typeof selectExternalIdFacts>,
): SeerrTargetProjection {
	if (selected.conflicts?.tmdbShow) {
		return { kind: "conflict" };
	}

	const tmdbId = selected.facts.tmdbShow;
	const source = selected.sources.tmdbShow;
	if (tmdbId === undefined || source === undefined) return { kind: "missing" };

	const evidence = selectTvShowEvidence(layers);
	return {
		kind: "target",
		source,
		target: {
			mediaType: "tv",
			tmdbId,
			...(evidence.tvdbShow === undefined
				? {}
				: { tvdbId: evidence.tvdbShow }),
			...(evidence.tmdbSeasons === undefined
				? {}
				: { tmdbSeasons: evidence.tmdbSeasons }),
			...(evidence.tvdbSeasons === undefined
				? {}
				: { tvdbSeasons: evidence.tvdbSeasons }),
			...(evidence.seasons === undefined ? {} : { seasons: evidence.seasons }),
		},
	};
}
