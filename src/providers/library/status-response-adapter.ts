/** Builds combined status responses from provider-library status plus mapping labels. */

import type {
	MappingAcceptedReason,
	MappingAcceptedSource,
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
	mappingSource?: MappingAcceptedSource;
	mappingReason?: MappingAcceptedReason;
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
	mappingSource?: MappingAcceptedSource;
	mappingReason?: MappingAcceptedReason;
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
