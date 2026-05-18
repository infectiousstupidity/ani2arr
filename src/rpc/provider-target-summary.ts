/** Provider-specific RPC target summary builders for modal-ready status DTOs. */
// src/rpc/provider-target-summary.ts

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

function joinProviderUrl(root: string, path?: string | null): string | undefined {
	if (!path) return undefined;
	const trimmedRoot = root.replace(/\/$/, "");
	if (/^https?:\/\//i.test(path)) return path;
	const normalized = path.startsWith("/") ? path : `/${path}`;
	return `${trimmedRoot}${normalized}`;
}

function pickProviderPoster(input: {
	images?: ProviderImage[] | undefined;
	remotePoster?: string | null | undefined;
	baseUrl: string;
}): string | undefined {
	const poster = input.images?.find(
		(image) => image.coverType?.toLowerCase() === "poster",
	);

	if (poster?.url && input.baseUrl) {
		return joinProviderUrl(input.baseUrl, poster.url);
	}

	return poster?.remoteUrl ?? input.remotePoster ?? undefined;
}

function getRemotePoster(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null || !("remotePoster" in value)) {
		return undefined;
	}

	const remotePoster = value.remotePoster;
	return typeof remotePoster === "string" ? remotePoster : undefined;
}

function normalizeLinkedAniListIds(
	ids: readonly number[] | undefined,
): ProviderTargetSummary["linkedAniListIds"] {
	if (!ids?.length) return undefined;

	const parsed = ids
		.map((id) => parseAniListIdOrNull(id))
		.filter((id): id is AniListId => id !== null);

	return parsed.length > 0 ? [...new Set(parsed)] : undefined;
}

function getSonarrProviderFolderName(
	series: SonarrTargetSeries,
): string | undefined {
	return "folder" in series && series.folder ? series.folder : undefined;
}

function getSonarrYear(series: SonarrTargetSeries): number | undefined {
	return "year" in series ? series.year : undefined;
}

function getSonarrTypeLabel(series: SonarrTargetSeries): string | undefined {
	return "seriesType" in series ? series.seriesType : undefined;
}

function getSonarrNetwork(series: SonarrTargetSeries): string | undefined {
	return "network" in series ? series.network : undefined;
}

function getSonarrOverview(series: SonarrTargetSeries): string | undefined {
	return "overview" in series ? series.overview : undefined;
}

function getSonarrPoster(
	series: SonarrTargetSeries,
	baseUrl: string,
): string | undefined {
	return pickProviderPoster({
		images: "images" in series ? series.images : undefined,
		remotePoster: getRemotePoster(series),
		baseUrl,
	});
}

function getSonarrEpisodeCount(
	series: SonarrTargetSeries,
): number | undefined {
	return (
		series.statistics?.episodeCount ??
		series.statistics?.totalEpisodeCount ??
		("episodeCount" in series ? series.episodeCount : undefined)
	);
}

function getSonarrEpisodeFileCount(
	series: SonarrTargetSeries,
): number | undefined {
	return (
		series.statistics?.episodeFileCount ??
		("episodeFileCount" in series ? series.episodeFileCount : undefined)
	);
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
	const providerFolderName = getSonarrProviderFolderName(series);
	const year = getSonarrYear(series);
	const typeLabel = getSonarrTypeLabel(series);
	const providerRouteSlug =
		getProviderRouteSlug("sonarr", series) ?? undefined;
	const posterUrl = getSonarrPoster(series, input.baseUrl);
	const networkOrStudio = getSonarrNetwork(series);
	const overview = getSonarrOverview(series);
	const episodeCount = getSonarrEpisodeCount(series);
	const episodeFileCount = getSonarrEpisodeFileCount(series);
	const linkedAniListIds = normalizeLinkedAniListIds(input.linkedAniListIds);

	return {
		provider: "sonarr",
		providerId: input.tvdbId,
		title: series.title,
		isInLibrary: input.isInLibrary === true,
		...(providerFolderName === undefined ? {} : { providerFolderName }),
		...(year === undefined ? {} : { year }),
		...(typeLabel === undefined ? {} : { typeLabel }),
		...(providerRouteSlug === undefined ? {} : { providerRouteSlug }),
		...(posterUrl === undefined ? {} : { posterUrl }),
		...(series.status === undefined ? {} : { statusLabel: series.status }),
		...(networkOrStudio === undefined ? {} : { networkOrStudio }),
		...(episodeCount === undefined ? {} : { episodeCount }),
		...(episodeFileCount === undefined ? {} : { episodeFileCount }),
		...(overview === undefined ? {} : { overview }),
		...(linkedAniListIds?.length ? { linkedAniListIds } : {}),
	};
}

function getRadarrAlternateTitles(movie: RadarrTargetMovie): string[] | undefined {
	const titles = movie.alternateTitles
		?.map((title) => (typeof title === "string" ? title : title.title))
		.filter((title): title is string => typeof title === "string" && title !== "");

	return titles?.length ? titles : undefined;
}

function getRadarrRuntime(movie: RadarrTargetMovie): number | undefined {
	return "runtime" in movie ? movie.runtime : undefined;
}

function getRadarrOverview(movie: RadarrTargetMovie): string | undefined {
	return "overview" in movie ? movie.overview : undefined;
}

function getRadarrPoster(
	movie: RadarrTargetMovie,
	baseUrl: string,
): string | undefined {
	return pickProviderPoster({
		images: "images" in movie ? movie.images : undefined,
		remotePoster: getRemotePoster(movie),
		baseUrl,
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
	const providerRouteSlug =
		getProviderRouteSlug("radarr", movie) ?? undefined;
	const posterUrl = getRadarrPoster(movie, input.baseUrl);
	const overview = getRadarrOverview(movie);
	const alternateTitles = getRadarrAlternateTitles(movie);
	const runtime = getRadarrRuntime(movie);
	const linkedAniListIds = normalizeLinkedAniListIds(input.linkedAniListIds);

	return {
		provider: "radarr",
		providerId: input.tmdbId,
		title: movie.title,
		isInLibrary: input.isInLibrary === true,
		typeLabel: "Movie",
		...(movie.folderName === undefined
			? {}
			: { providerFolderName: movie.folderName }),
		...(movie.year === undefined ? {} : { year: movie.year }),
		...(providerRouteSlug === undefined ? {} : { providerRouteSlug }),
		...(posterUrl === undefined ? {} : { posterUrl }),
		...(movie.status === undefined ? {} : { statusLabel: movie.status }),
		...(overview === undefined ? {} : { overview }),
		...(alternateTitles === undefined ? {} : { alternateTitles }),
		...(runtime === undefined ? {} : { runtimeMinutes: runtime }),
		...(movie.hasFile === undefined ? {} : { hasFile: movie.hasFile }),
		...(linkedAniListIds?.length ? { linkedAniListIds } : {}),
	};
}
