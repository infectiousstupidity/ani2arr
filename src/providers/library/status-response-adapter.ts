/** Builds combined status responses from provider-library status plus mapping labels. */

import type {
	AcceptedMappingReason,
	AcceptedMappingSource,
} from "@/mapping/types";
import type { TmdbId, TvdbId } from "@/providers";
import type {
	CheckMovieStatusResponse,
	CheckSeriesStatusResponse,
} from "@/rpc/types";
import type {
	RadarrLibraryStatus,
	SonarrLibraryStatus,
} from "@/providers/library/types";

export function buildSeriesStatusResponseFromLibraryStatus(input: {
	providerId: TvdbId;
	mappingSource?: AcceptedMappingSource;
	mappingReason?: AcceptedMappingReason;
	libraryStatus: SonarrLibraryStatus;
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
		...(input.mappingSource
			? { mappingSource: input.mappingSource }
			: {}),
		...(input.mappingReason
			? { mappingReason: input.mappingReason }
			: {}),
	};
}

export function buildMovieStatusResponseFromLibraryStatus(input: {
	providerId: TmdbId;
	mappingSource?: AcceptedMappingSource;
	mappingReason?: AcceptedMappingReason;
	libraryStatus: RadarrLibraryStatus;
}): CheckMovieStatusResponse {
	return {
		providerId: input.providerId,
		providerMappingState: "mapped",
		isInLibrary: input.libraryStatus.isInLibrary,
		...(input.libraryStatus.movie ? { movie: input.libraryStatus.movie } : {}),
		...(input.libraryStatus.libraryUnknownReason
			? { libraryUnknownReason: input.libraryStatus.libraryUnknownReason }
			: {}),
		...(input.mappingSource
			? { mappingSource: input.mappingSource }
			: {}),
		...(input.mappingReason
			? { mappingReason: input.mappingReason }
			: {}),
	};
}
