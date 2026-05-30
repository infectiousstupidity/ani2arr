// src/rpc/provider-target-summary.ts
/** Builds provider-specific RPC target summaries for modal-ready status DTOs. */

import { parseAniListIdOrNull, type AniListId } from "@/anilist";
import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import type {
	RadarrLookupMovie,
	RadarrMovie,
	RadarrMovieSnapshot,
	TmdbId,
} from "@/providers/radarr/types";
import type {
	SonarrLookupSeries,
	SonarrSeries,
	SonarrSeriesSnapshot,
	TvdbId,
} from "@/providers/sonarr/types";
import type { ProviderTargetSummary } from "./types";

type ProviderImage = {
	coverType?: string | null | undefined;
	url?: string | null | undefined;
	remoteUrl?: string | null | undefined;
};

type RadarrTargetMovie = RadarrMovieSnapshot | RadarrMovie | RadarrLookupMovie;

type SonarrTargetSeries =
	| SonarrSeriesSnapshot
	| SonarrSeries
	| SonarrLookupSeries;

type LooseProviderTargetSummary = {
	[Key in keyof ProviderTargetSummary]: ProviderTargetSummary[Key] | undefined;
};

function joinProviderUrl(
	root: string,
	path?: string | null,
): string | undefined {
	if (!path) return undefined;
	if (/^https?:\/\//i.test(path)) return path;

	const trimmedRoot = root.replace(/\/$/, "");
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;

	return `${trimmedRoot}${normalizedPath}`;
}

function pickProviderPoster(input: {
	images?: ProviderImage[] | undefined;
	remotePoster?: string | null | undefined;
	baseUrl: string;
}): string | undefined {
	const poster = input.images?.find(
		(image) => image.coverType?.toLowerCase() === "poster",
	);

	return (
		joinProviderUrl(input.baseUrl, poster?.url) ??
		poster?.remoteUrl ??
		input.remotePoster ??
		undefined
	);
}

function getRemotePoster(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	if (!("remotePoster" in value)) return undefined;

	return typeof value.remotePoster === "string"
		? value.remotePoster
		: undefined;
}

function normalizeLinkedAniListIds(
	ids: readonly number[] | undefined,
): ProviderTargetSummary["linkedAniListIds"] {
	if (!ids?.length) return undefined;

	const parsed = ids
		.map((id) => parseAniListIdOrNull(id))
		.filter((id): id is AniListId => id !== null);

	const unique = [...new Set(parsed)];

	return unique.length > 0 ? unique : undefined;
}

function getRadarrAlternateTitles(
	movie: RadarrTargetMovie,
): string[] | undefined {
	const titles = movie.alternateTitles
		?.map((title) => (typeof title === "string" ? title : title.title))
		.filter((t): t is string => !!t);

	return titles?.length ? titles : undefined;
}

function cleanProviderTargetSummary(
	summary: LooseProviderTargetSummary,
): ProviderTargetSummary {
	return Object.fromEntries(
		Object.entries(summary).filter(([, value]) => value !== undefined),
	) as ProviderTargetSummary;
}

export function buildSonarrTargetSummary(input: {
	tvdbId: TvdbId;
	series: SonarrTargetSeries | undefined;
	isInLibrary: boolean | null;
	baseUrl: string;
	linkedAniListIds?: readonly number[] | undefined;
}): ProviderTargetSummary | null {
	if (!input.series) return null;

	const series = input.series;

	return cleanProviderTargetSummary({
		provider: "sonarr",
		providerId: input.tvdbId,
		title: series.title,
		isInLibrary: input.isInLibrary === true,

		providerFolderName: "folder" in series ? series.folder : undefined,
		year: "year" in series ? series.year : undefined,
		typeLabel: "seriesType" in series ? series.seriesType : undefined,
		providerRouteSlug: getProviderRouteSlug("sonarr", series) ?? undefined,
		posterUrl: pickProviderPoster({
			images: "images" in series ? series.images : undefined,
			remotePoster: getRemotePoster(series),
			baseUrl: input.baseUrl,
		}),
		statusLabel: series.status,
		networkOrStudio: "network" in series ? series.network : undefined,
		episodeCount:
			series.statistics?.episodeCount ??
			series.statistics?.totalEpisodeCount ??
			("episodeCount" in series ? series.episodeCount : undefined),
		episodeFileCount:
			series.statistics?.episodeFileCount ??
			("episodeFileCount" in series ? series.episodeFileCount : undefined),
		overview: "overview" in series ? series.overview : undefined,
		linkedAniListIds: normalizeLinkedAniListIds(input.linkedAniListIds),
	});
}

export function buildRadarrTargetSummary(input: {
	tmdbId: TmdbId;
	movie: RadarrTargetMovie | undefined;
	isInLibrary: boolean | null;
	baseUrl: string;
	linkedAniListIds?: readonly number[] | undefined;
}): ProviderTargetSummary | null {
	if (!input.movie) return null;

	const movie = input.movie;

	return cleanProviderTargetSummary({
		provider: "radarr",
		providerId: input.tmdbId,
		title: movie.title,
		isInLibrary: input.isInLibrary === true,
		typeLabel: "Movie",

		providerFolderName: movie.folderName,
		year: movie.year,
		providerRouteSlug: getProviderRouteSlug("radarr", movie) ?? undefined,
		posterUrl: pickProviderPoster({
			images: "images" in movie ? movie.images : undefined,
			remotePoster: getRemotePoster(movie),
			baseUrl: input.baseUrl,
		}),
		statusLabel: movie.status,
		overview: "overview" in movie ? movie.overview : undefined,
		alternateTitles: getRadarrAlternateTitles(movie),
		runtimeMinutes: "runtime" in movie ? movie.runtime : undefined,
		hasFile: movie.hasFile,
		linkedAniListIds: normalizeLinkedAniListIds(input.linkedAniListIds),
	});
}
