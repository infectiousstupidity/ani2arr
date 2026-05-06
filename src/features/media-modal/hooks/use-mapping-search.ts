/** Owns modal-local mapping search adaptation on top of provider query hooks. */
// src/features/media-modal/hooks/use-mapping-search.ts

import type { MappingSearchResult } from "@/features/media-modal/mapping-search/types";
import { toMappingSearchResultFromRadarr } from "@/features/media-modal/mapping-search/radarr-search-result.adapter";
import { toMappingSearchResultFromSonarr } from "@/features/media-modal/mapping-search/sonarr-search-result.adapter";
import { usePublicOptions } from "@/options";
import { useRadarrLookupSearch } from "@/providers/hooks/radarr.queries";
import { useSonarrLookupSearch } from "@/providers/hooks/sonarr.queries";
import { getProviderBaseUrl } from "@/options/provider-config";
import type { RadarrLookupOutput, SonarrLookupOutput } from "@/rpc/types";
import type { Provider } from "@/providers";

type UseMappingSearchInput = {
	provider: Provider;
	query: string;
	enabled: boolean;
};

type UseMappingSearchResult = {
	data: MappingSearchResult[] | undefined;
	isFetching: boolean;
};

export function adaptSonarrLookupSearch(
	output: SonarrLookupOutput,
	baseUrl: string,
): MappingSearchResult[] {
	return output.results.map((result) =>
		toMappingSearchResultFromSonarr(result, {
			baseUrl,
			libraryTvdbIds: output.libraryTvdbIds,
			...(output.statsMap ? { statsMap: output.statsMap } : {}),
			...(output.linkedAniListIdsByTvdbId
				? { linkedAniListIdsByTvdbId: output.linkedAniListIdsByTvdbId }
				: {}),
		}),
	);
}

export function adaptRadarrLookupSearch(
	output: RadarrLookupOutput,
	baseUrl: string,
): MappingSearchResult[] {
	const libraryTmdbIdSet = new Set(output.libraryTmdbIds);

	return output.results.map((result) =>
		toMappingSearchResultFromRadarr(result, {
			baseUrl,
			isInLibrary: libraryTmdbIdSet.has(result.tmdbId),
			...(output.linkedAniListIdsByTmdbId
				? { linkedAniListIdsByTmdbId: output.linkedAniListIdsByTmdbId }
				: {}),
		}),
	);
}

export function useMappingSearch(
	input: UseMappingSearchInput,
): UseMappingSearchResult {
	const query = input.query.trim();
	const enabled = input.enabled && query.length >= 2;

	const publicOptions = usePublicOptions();
	const baseUrl = getProviderBaseUrl(input.provider, publicOptions.data);

	const sonarrSearch = useSonarrLookupSearch({
		term: query,
		enabled: enabled && input.provider === "sonarr",
	});

	const radarrSearch = useRadarrLookupSearch({
		term: query,
		enabled: enabled && input.provider === "radarr",
	});

	if (input.provider === "radarr") {
		return {
			data: radarrSearch.data
				? adaptRadarrLookupSearch(radarrSearch.data, baseUrl)
				: undefined,
			isFetching: radarrSearch.isFetching,
		};
	}

	return {
		data: sonarrSearch.data
			? adaptSonarrLookupSearch(sonarrSearch.data, baseUrl)
			: undefined,
		isFetching: sonarrSearch.isFetching,
	};
}
