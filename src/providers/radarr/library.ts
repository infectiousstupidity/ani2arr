/** Radarr provider-domain library status types for TMDB library checks. */
// src/providers/radarr/library.ts

import type { LibraryUnknownReason } from "@/mapping/library-status";
import type {
	RadarrLookupMovie,
	RadarrMovie,
	RadarrMovieSnapshot,
	TmdbId,
} from "@/providers";

export interface RadarrMovieLibraryStatus {
	provider: "radarr";
	providerId: TmdbId;
	isInLibrary: boolean | null;
	movie?: RadarrMovieSnapshot | RadarrMovie | RadarrLookupMovie;
	libraryUnknownReason?: LibraryUnknownReason;
}
