/** LEGACY: Radarr library support types retained until Radarr moves into src/providers/radarr. */
// src/providers/library/types.ts

import type { LibraryUnknownReason } from "@/mapping/library-status";
import type {
	RadarrLookupMovie,
	RadarrMovie,
	RadarrMovieSnapshot,
	TmdbId,
} from "@/providers";
import type { TtlCache } from "@/shared/cache/ttl-cache";

/** LEGACY: Radarr cache dependency shape retained until Radarr moves into src/providers/radarr. */
export interface ProviderLibraryCaches<TSnapshot> {
	lean: TtlCache<TSnapshot[]>;
}

/** LEGACY: Radarr library status shape retained until Radarr moves into src/providers/radarr. */
export interface RadarrMovieLibraryStatus {
	provider: "radarr";
	providerId: TmdbId;
	isInLibrary: boolean | null;
	movie?: RadarrMovieSnapshot | RadarrMovie | RadarrLookupMovie;
	libraryUnknownReason?: LibraryUnknownReason;
}

/** LEGACY: Radarr mutation callback shape retained until Radarr moves into src/providers/radarr. */
export type LibraryMutationEmitter<TPayload> = (
	payload: TPayload,
) => Promise<void> | void;
