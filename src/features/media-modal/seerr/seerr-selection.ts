/** Pure Seerr modal helpers for season selection and search filtering. */
// src/features/media-modal/seerr/seerr-selection.ts

import type { AniListMediaFormat } from "@/anilist/types";
import { normalizeSeasonNumbers } from "@/mapping/season-numbers";
import type {
	SeerrMediaType,
	SeerrSearchResult,
	SeerrSeasonStatus,
} from "@/providers/seerr/types";
import type { SeerrRequestTarget } from "@/rpc/types";

export type SeerrSeasonDraft = {
	key: string;
	seasons: number[];
};

export function getSeerrDetailsSeasonKey(
	seasons: ReadonlyArray<{ seasonNumber: number; status: string }> | undefined,
): string {
	return (seasons ?? [])
		.map((season) => `${season.seasonNumber}:${season.status}`)
		.join("|");
}

export function getSeerrTargetSeasonKey(
	target: SeerrRequestTarget | null | undefined,
): string {
	if (target?.mediaType !== "tv") return "";

	return [
		`effective:${target.seasons?.join(",") ?? ""}`,
		`tmdb:${target.tmdbSeasons?.join(",") ?? ""}`,
		`tvdb:${target.tvdbSeasons?.join(",") ?? ""}`,
	].join("|");
}

export function getRequestableSeasonNumbers(
	seasons: readonly SeerrSeasonStatus[] | undefined,
): number[] {
	return normalizeSeasonNumbers(
		(seasons ?? [])
			.filter((season) => season.requestable)
			.map((season) => season.seasonNumber),
	);
}

export type SeerrSeasonAvailabilitySummary = {
	availableSeasonCount: number;
	partialSeasonCount: number;
	requestableSeasonCount: number;
	pendingSeasonCount: number;
	episodeCount?: number;
};

export function summarizeSeerrSeasonAvailability(
	seasons: readonly SeerrSeasonStatus[] | undefined,
): SeerrSeasonAvailabilitySummary | null {
	if (!seasons || seasons.length === 0) return null;

	let availableSeasonCount = 0;
	let partialSeasonCount = 0;
	let requestableSeasonCount = 0;
	let pendingSeasonCount = 0;
	let episodeCount = 0;
	let hasEpisodeCount = false;

	for (const season of seasons) {
		if (season.status === "available") {
			availableSeasonCount += 1;
		}

		if (season.status === "partial") {
			partialSeasonCount += 1;
		}

		if (season.requestable) {
			requestableSeasonCount += 1;
		}

		if (season.status === "pending" || season.status === "processing") {
			pendingSeasonCount += 1;
		}

		if (season.episodeCount !== undefined) {
			episodeCount += season.episodeCount;
			hasEpisodeCount = true;
		}
	}

	return {
		availableSeasonCount,
		partialSeasonCount,
		requestableSeasonCount,
		pendingSeasonCount,
		...(hasEpisodeCount ? { episodeCount } : {}),
	};
}

function isNumericSeasonName(
	name: string | undefined,
	seasonNumber: number,
): boolean {
	if (name === undefined) return false;

	const normalized = name.trim().toLowerCase();
	return (
		normalized === String(seasonNumber) ||
		normalized === `season ${seasonNumber}` ||
		normalized === `s${seasonNumber}`
	);
}

export function getSeerrSeasonDisplayTitle(season: {
	seasonNumber: number;
	name?: string;
}): string {
	const name = season.name?.trim();

	if (season.seasonNumber === 0) {
		if (!name || isNumericSeasonName(name, season.seasonNumber)) {
			return "Specials";
		}

		return `S0 - ${name}`;
	}

	if (!name || isNumericSeasonName(name, season.seasonNumber)) {
		return `Season ${season.seasonNumber}`;
	}

	return `S${season.seasonNumber} - ${name}`;
}

type SeerrSeasonShape = "tmdb" | "tvdb" | "unknown";

function getSeerrSeasonShape(
	seasons: readonly SeerrSeasonStatus[] | undefined,
): SeerrSeasonShape {
	if (!seasons || seasons.length === 0) return "unknown";

	let namedSeasonCount = 0;
	let numericSeasonNameCount = 0;

	for (const season of seasons) {
		if (season.seasonNumber === 0) continue;

		const name = season.name?.trim();
		if (!name) continue;

		if (isNumericSeasonName(name, season.seasonNumber)) {
			numericSeasonNameCount += 1;
		} else {
			namedSeasonCount += 1;
		}
	}

	if (namedSeasonCount > 0) return "tmdb";
	if (numericSeasonNameCount > 0) return "tvdb";
	return "unknown";
}

export function getMappedSeasonsForDetails(input: {
	mappedSeasons?: readonly number[] | undefined;
	tmdbMappedSeasons?: readonly number[] | undefined;
	tvdbMappedSeasons?: readonly number[] | undefined;
	seasons: readonly SeerrSeasonStatus[] | undefined;
}): number[] {
	const shape = getSeerrSeasonShape(input.seasons);
	let mappedSeasons: readonly number[];

	if (shape === "tvdb" && input.tvdbMappedSeasons?.length) {
		mappedSeasons = input.tvdbMappedSeasons;
	} else if (shape === "tmdb" && input.tmdbMappedSeasons?.length) {
		mappedSeasons = input.tmdbMappedSeasons;
	} else {
		mappedSeasons = input.mappedSeasons ?? [];
	}

	return normalizeSeasonNumbers(mappedSeasons);
}

export function getDefaultSelectedSeasons(input: {
	mappedSeasons?: readonly number[] | undefined;
	tmdbMappedSeasons?: readonly number[] | undefined;
	tvdbMappedSeasons?: readonly number[] | undefined;
	seasons: readonly SeerrSeasonStatus[] | undefined;
}): number[] {
	const requestable = new Set(getRequestableSeasonNumbers(input.seasons));
	const mappedSeasons = getMappedSeasonsForDetails(input);

	return mappedSeasons.filter((season) => requestable.has(season));
}

export function toggleSeasonSelection(
	selectedSeasons: readonly number[],
	seasonNumber: number,
): number[] {
	const selected = new Set(selectedSeasons);
	if (selected.has(seasonNumber)) {
		selected.delete(seasonNumber);
	} else {
		selected.add(seasonNumber);
	}

	return normalizeSeasonNumbers([...selected]);
}

export function getTmdbPosterUrl(
	posterPath: string | null | undefined,
): string | null {
	if (!posterPath?.startsWith("/")) return null;

	return `https://image.tmdb.org/t/p/w342${posterPath}`;
}

export function getExpectedSeerrMediaType(input: {
	currentTargetMediaType?: SeerrMediaType | undefined;
	format?: AniListMediaFormat | null | undefined;
}): SeerrMediaType | null {
	if (input.currentTargetMediaType) return input.currentTargetMediaType;

	switch (input.format) {
		case "MOVIE": {
			return "movie";
		}
		case "TV":
		case "TV_SHORT":
		case "SPECIAL":
		case "OVA":
		case "ONA":
		case "MUSIC": {
			return "tv";
		}
		default: {
			return null;
		}
	}
}

export function filterSeerrSearchResults(input: {
	results: readonly SeerrSearchResult[];
	expectedMediaType: SeerrMediaType | null;
}): SeerrSearchResult[] {
	if (input.expectedMediaType === null) return [...input.results];

	const expectedResults = input.results.filter(
		(result) => result.mediaType === input.expectedMediaType,
	);
	return expectedResults.length > 0 ? expectedResults : [...input.results];
}
