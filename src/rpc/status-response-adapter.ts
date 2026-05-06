/** Builds combined status responses from provider-library status plus mapping labels. */
// src/rpc/status-response-adapter.ts
/** LEGACY: Temporary glue while UI status state still consumes RPC status DTOs. */

import type {
	AcceptedMappingReason,
	AcceptedMappingSource,
} from "@/mapping/types";
import type { TmdbId, TvdbId } from "@/providers";
import type { RadarrMovieLibraryStatus } from "@/providers/radarr/library";
import type { SonarrSeriesLibraryStatus } from "@/providers/sonarr/library";
import type {
	CheckMovieStatusResponse,
	CheckSeriesStatusResponse,
} from "@/rpc/types";

export function buildSeriesStatusResponseFromLibraryStatus(input: {
	providerId: TvdbId;
	mappingSource?: AcceptedMappingSource;
	mappingReason?: AcceptedMappingReason;
	libraryStatus: SonarrSeriesLibraryStatus;
}): CheckSeriesStatusResponse {
	return {
		providerId: input.providerId,
		providerMappingState: "mapped",
		isInLibrary: input.libraryStatus.isInLibrary,
		...(input.libraryStatus.series
			? { series: input.libraryStatus.series }
			: {}),
		...(input.libraryStatus.libraryUnknownReason
			? { libraryUnknownReason: input.libraryStatus.libraryUnknownReason }
			: {}),
		...(input.mappingSource ? { mappingSource: input.mappingSource } : {}),
		...(input.mappingReason ? { mappingReason: input.mappingReason } : {}),
	};
}

export function buildMovieStatusResponseFromLibraryStatus(input: {
	providerId: TmdbId;
	mappingSource?: AcceptedMappingSource;
	mappingReason?: AcceptedMappingReason;
	libraryStatus: RadarrMovieLibraryStatus;
}): CheckMovieStatusResponse {
	return {
		providerId: input.providerId,
		providerMappingState: "mapped",
		isInLibrary: input.libraryStatus.isInLibrary,
		...(input.libraryStatus.movie ? { movie: input.libraryStatus.movie } : {}),
		...(input.libraryStatus.libraryUnknownReason
			? { libraryUnknownReason: input.libraryStatus.libraryUnknownReason }
			: {}),
		...(input.mappingSource ? { mappingSource: input.mappingSource } : {}),
		...(input.mappingReason ? { mappingReason: input.mappingReason } : {}),
	};
}
