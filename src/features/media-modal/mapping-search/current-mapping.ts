/** Derives the current provider mapping view model from provider status responses. */
// src/features/media-modal/mapping-search/current-mapping.ts

import { parseAniListIdOrNull, type AniListId } from "@/anilist";
import type {
	CheckMovieStatusResponse,
	CheckSeriesStatusResponse,
} from "@/rpc/types";
import type {
	Provider,
	RadarrLookupMovie,
	TmdbId,
	TvdbId,
} from "@/providers";
import type { SonarrLookupSeries } from "@/providers/sonarr/types";
import type { ProviderExternalId } from "@/mapping/types";
import {
	getProviderRouteSlug,
	type ProviderRouteSlugSource,
} from "@/providers/provider-route-slug";
import { getProviderExternalIdLabel } from "@/providers/provider-labels";
import { toMappingSearchResultFromRadarr } from "./radarr-search-result.adapter";
import { toMappingSearchResultFromSonarr } from "./sonarr-search-result.adapter";
import type { MappingSearchResult } from "./types";

type DeriveCurrentMappingInput =
	| {
			provider: "radarr";
			status: CheckMovieStatusResponse | null | undefined;
			baseUrl?: string | undefined;
			fallbackProviderId?: TmdbId | null | undefined;
			fallbackTitle?: string | undefined;
	  }
	| {
			provider: "sonarr";
			status: CheckSeriesStatusResponse | null | undefined;
			baseUrl?: string | undefined;
			fallbackProviderId?: TvdbId | null | undefined;
			fallbackTitle?: string | undefined;
	  };

const parseLinkedAniListIds = (
	ids: readonly number[] | undefined,
): AniListId[] | undefined => {
	if (!ids?.length) return undefined;
	const parsed = ids
		.map((id) => parseAniListIdOrNull(id))
		.filter((id): id is AniListId => id !== null);
	return parsed.length > 0 ? parsed : undefined;
};

const readSonarrFolderName = (value: unknown): string | undefined => {
	if (
		typeof value !== "object" ||
		value === null ||
		!("folder" in value) ||
		typeof value.folder !== "string"
	) {
		return undefined;
	}

	const folder = value.folder.trim();
	return folder.length > 0 ? folder : undefined;
};

const readRadarrFolderName = (value: unknown): string | undefined => {
	if (
		typeof value !== "object" ||
		value === null ||
		!("folderName" in value) ||
		typeof value.folderName !== "string"
	) {
		return undefined;
	}

	const folderName = value.folderName.trim();
	return folderName.length > 0 ? folderName : undefined;
};

function buildFallbackMapping(input: {
	provider: Provider;
	providerId: ProviderExternalId;
	title?: string | undefined;
	isInLibrary: boolean;
	providerFolderName?: string | undefined;
	providerRouteSlug?: string | null | undefined;
	linkedAniListIds?: AniListId[] | undefined;
}): MappingSearchResult {
	const providerLabel = getProviderExternalIdLabel(input.provider);

	return {
		provider: input.provider,
		providerId: input.providerId,
		title: input.title
			? `${input.title} (${providerLabel} ${input.providerId})`
			: `${providerLabel} ${input.providerId}`,
		isInLibrary: input.isInLibrary,
		...(input.providerFolderName
			? { providerFolderName: input.providerFolderName }
			: {}),
		...(input.providerRouteSlug
			? { providerRouteSlug: input.providerRouteSlug }
			: {}),
		...(input.linkedAniListIds?.length
			? { linkedAniListIds: input.linkedAniListIds }
			: {}),
	} as MappingSearchResult;
}

function deriveRadarrCurrentMapping(input: {
	status: CheckMovieStatusResponse | null | undefined;
	baseUrl?: string | undefined;
	fallbackProviderId?: TmdbId | null | undefined;
	fallbackTitle?: string | undefined;
}): MappingSearchResult | null {
	const statusProviderId = input.status?.providerId ?? null;
	const providerId = statusProviderId ?? input.fallbackProviderId ?? null;
	if (providerId == null) {
		return null;
	}

	const isInLibrary = input.status?.isInLibrary === true;
	const linkedAniListIds = parseLinkedAniListIds(
		input.status?.linkedAniListIds,
	);
	const movie = input.status?.movie;

	if (movie && "images" in movie) {
		return {
			...toMappingSearchResultFromRadarr(movie as RadarrLookupMovie, {
				baseUrl: input.baseUrl ?? "",
				isInLibrary,
			}),
			...(linkedAniListIds?.length ? { linkedAniListIds } : {}),
		};
	}

	return buildFallbackMapping({
		provider: "radarr",
		providerId,
		title:
			movie?.title ??
			(statusProviderId == null ? input.fallbackTitle : undefined),
		isInLibrary,
		providerFolderName: readRadarrFolderName(movie),
		providerRouteSlug: getProviderRouteSlug(
			"radarr",
			movie as ProviderRouteSlugSource | undefined,
		),
		linkedAniListIds,
	});
}

function deriveSonarrCurrentMapping(input: {
	status: CheckSeriesStatusResponse | null | undefined;
	baseUrl?: string | undefined;
	fallbackProviderId?: TvdbId | null | undefined;
	fallbackTitle?: string | undefined;
}): MappingSearchResult | null {
	const statusProviderId = input.status?.providerId ?? null;
	const providerId = statusProviderId ?? input.fallbackProviderId ?? null;
	if (providerId == null) {
		return null;
	}

	const isInLibrary = input.status?.isInLibrary === true;
	const linkedAniListIds = parseLinkedAniListIds(
		input.status?.linkedAniListIds,
	);
	const series = input.status?.series;

	if (series && "images" in series) {
		return {
			...toMappingSearchResultFromSonarr(series as SonarrLookupSeries, {
				baseUrl: input.baseUrl ?? "",
				libraryTvdbIds: isInLibrary ? [providerId] : [],
			}),
			...(linkedAniListIds?.length ? { linkedAniListIds } : {}),
		};
	}

	return buildFallbackMapping({
		provider: "sonarr",
		providerId,
		title:
			series?.title ??
			(statusProviderId == null ? input.fallbackTitle : undefined),
		isInLibrary,
		providerFolderName: readSonarrFolderName(series),
		providerRouteSlug: getProviderRouteSlug(
			"sonarr",
			series as ProviderRouteSlugSource | undefined,
		),
		linkedAniListIds,
	});
}

export function deriveCurrentMapping(
	input: DeriveCurrentMappingInput,
): MappingSearchResult | null {
	if (input.provider === "radarr") {
		return deriveRadarrCurrentMapping(input);
	}

	return deriveSonarrCurrentMapping(input);
}
