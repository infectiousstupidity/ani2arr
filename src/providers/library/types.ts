/** Provider-library support types owned by the provider domain. */
// src/providers/library/types.ts

import type { AniListId } from "@/anilist";
import type {
	RadarrLookupMovie,
	RadarrMovie,
	RadarrMovieSnapshot,
	TmdbId,
} from "@/providers";
import type { TtlCache } from "@/shared/cache/ttl-cache";
import type { RequestPriority } from "@/shared/utils/request-priority";

export type LibraryUnknownReason = "library-check-failed";

export const deriveLibraryUnknownReason = (input: {
	providerMappingState: "mapped" | "unmapped" | "unknown";
	isInLibrary: boolean | null;
	libraryUnknownReason?: LibraryUnknownReason;
}): LibraryUnknownReason | undefined => {
	if (input.providerMappingState !== "mapped" || input.isInLibrary !== null) {
		return undefined;
	}
	return input.libraryUnknownReason ?? "library-check-failed";
};

export interface LibraryStatusOptions {
	force_verify?: boolean;
	network?: "never";
	priority?: RequestPriority;
}

export interface ProviderLibraryCaches<TSnapshot> {
	lean: TtlCache<TSnapshot[]>;
}

export interface RadarrLibraryStatus {
	anilistId: AniListId;
	provider: "radarr";
	providerId: TmdbId;
	isInLibrary: boolean | null;
	movie?: RadarrMovieSnapshot | RadarrMovie | RadarrLookupMovie;
	libraryUnknownReason?: LibraryUnknownReason;
}

export type LibraryMutationEmitter<TPayload> = (
	payload: TPayload,
) => Promise<void> | void;
