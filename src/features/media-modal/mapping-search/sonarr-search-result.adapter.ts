/** Adapts Sonarr lookup payloads into shared manual-mapping result rows. */
// src/features/media-modal/mapping-search/sonarr-search-result.adapter.ts

import { parseAniListIdOrNull, type AniListId } from "@/anilist";
import { parseTvdbId } from "@/providers";
import type { SonarrLookupSeries } from "@/providers/sonarr/types";
import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import type { MappingSearchResult } from "./types";

export interface SonarrAdapterOptions {
	baseUrl: string; // absolute; trailing slash trimmed
	libraryTvdbIds?: readonly number[];
	providerRouteSlugByTvdbId?: Readonly<Record<number, string>>;
	statsMap?: Readonly<
		Record<
			number,
			{
				episodeCount?: number | undefined;
				episodeFileCount?: number | undefined;
				totalEpisodeCount?: number | undefined;
			}
		>
	>;
	linkedAniListIdsByTvdbId?: Readonly<Record<number, readonly number[]>>;
}

type SonarrLookupSeriesExtra = SonarrLookupSeries & {
	overview?: unknown;
	alternateTitles?: unknown;
};

type SonarrResultStats = {
	episodeOrMovieCount?: number;
	fileCount?: number;
};

const joinUrl = (root: string, path?: string | null): string | undefined => {
	if (!path) return undefined;
	const trimmedRoot = root.replace(/\/$/, "");
	if (/^https?:\/\//i.test(path)) return path;
	const normalized = path.startsWith("/") ? path : `/${path}`;
	return `${trimmedRoot}${normalized}`;
};

const pickPoster = (
	series: SonarrLookupSeries,
	baseUrl: string,
): string | undefined => {
	const images = Array.isArray(series.images) ? series.images : [];
	const poster = images.find(
		(img) => (img?.coverType || "").toLowerCase() === "poster",
	);

	if (poster) {
		// Prefer local/proxy URL if available so it matches Sonarr dashboard
		if (poster.url && baseUrl) {
			return joinUrl(baseUrl, poster.url);
		}
		return poster.remoteUrl ?? undefined;
	}

	if (series.remotePoster) return series.remotePoster;
	return undefined;
};

function resolveProviderRouteSlug(
	series: SonarrLookupSeries,
	opts: SonarrAdapterOptions,
	tvdbId: number,
	isInLibrary: boolean,
): string | undefined {
	const cachedSlug = opts.providerRouteSlugByTvdbId?.[tvdbId];
	if (cachedSlug) return cachedSlug;
	return isInLibrary
		? (getProviderRouteSlug("sonarr", series) ?? undefined)
		: undefined;
}

function resolveStats(
	series: SonarrLookupSeries,
	opts: SonarrAdapterOptions,
	tvdbId: number,
	isInLibrary: boolean,
): SonarrResultStats {
	const lookupStats = series.statistics;
	const hasLookupStats = (lookupStats?.episodeFileCount ?? 0) > 0;
	const cachedStats = isInLibrary ? opts.statsMap?.[tvdbId] : undefined;
	const stats = hasLookupStats ? lookupStats : (cachedStats ?? lookupStats);
	const episodeOrMovieCount = stats?.episodeCount ?? stats?.totalEpisodeCount;

	return {
		...(episodeOrMovieCount === undefined ? {} : { episodeOrMovieCount }),
		...(stats?.episodeFileCount === undefined
			? {}
			: { fileCount: stats.episodeFileCount }),
	};
}

function readOverview(series: SonarrLookupSeriesExtra): string | undefined {
	return typeof series.overview === "string" ? series.overview : undefined;
}

function readAlternateTitles(
	series: SonarrLookupSeriesExtra,
): string[] | undefined {
	if (!Array.isArray(series.alternateTitles)) return undefined;

	const titles = series.alternateTitles
		.map((item) => (typeof item === "string" ? item : undefined))
		.filter((title): title is string => title !== undefined && title.length > 0);

	return titles.length > 0 ? titles : undefined;
}

function resolveLinkedAniListIds(
	opts: SonarrAdapterOptions,
	tvdbId: number,
): AniListId[] | undefined {
	const linkedIds = opts.linkedAniListIdsByTvdbId?.[tvdbId];
	if (!Array.isArray(linkedIds)) return undefined;

	const parsed = linkedIds
		.map((id) => parseAniListIdOrNull(id))
		.filter((id): id is AniListId => id !== null);

	return parsed.length > 0 ? [...new Set(parsed)] : undefined;
}

export function toMappingSearchResultFromSonarr(
	series: SonarrLookupSeries,
	opts: SonarrAdapterOptions,
): MappingSearchResult {
	const tvdbId = parseTvdbId(series.tvdbId);
	const librarySet = new Set(opts.libraryTvdbIds);
	const isInLibrary = librarySet.has(tvdbId);
	const providerRouteSlug = resolveProviderRouteSlug(
		series,
		opts,
		tvdbId,
		isInLibrary,
	);
	const year = typeof series.year === "number" ? series.year : undefined;
	const typeLabel = series.seriesType;
	const posterUrl = pickPoster(series, opts.baseUrl);
	const statusLabel = series.status;
	const networkOrStudio = series.network;
	const { episodeOrMovieCount, fileCount } = resolveStats(
		series,
		opts,
		tvdbId,
		isInLibrary,
	);
	const extra = series as SonarrLookupSeriesExtra;
	const overview = readOverview(extra);
	const alternateTitles = readAlternateTitles(extra);
	const linkedAniListIds = resolveLinkedAniListIds(opts, tvdbId);

	return {
		provider: "sonarr",
		providerId: tvdbId,
		title: series.title,
		...(series.folder ? { providerFolderName: series.folder } : {}),
		...(year === undefined ? {} : { year }),
		...(typeLabel ? { typeLabel } : {}),
		isInLibrary,
		...(providerRouteSlug ? { providerRouteSlug } : {}),
		...(posterUrl === undefined ? {} : { posterUrl }),
		...(statusLabel === undefined ? {} : { statusLabel }),
		...(networkOrStudio === undefined ? {} : { networkOrStudio }),
		...(episodeOrMovieCount === undefined ? {} : { episodeOrMovieCount }),
		...(fileCount === undefined ? {} : { fileCount }),
		...(overview ? { overview } : {}),
		...(alternateTitles && alternateTitles.length > 0
			? { alternateTitles }
			: {}),
		...(linkedAniListIds && linkedAniListIds.length > 0
			? { linkedAniListIds: [...new Set(linkedAniListIds)] }
			: {}),
	};
}
