/** Owns the shared provider mapping search/result view model used by manual mapping flows. */
// src/features/media-modal/mapping-search/types.ts

import type { AniListId } from "@/anilist";
import type { ProviderId, TmdbId, TvdbId } from "@/providers";

interface MappingSearchResultBase {
	title: string;
	year?: number;
	typeLabel?: string;
	isInLibrary: boolean;
	providerRouteSlug?: string;
	posterUrl?: string;
	backdropUrl?: string;
	statusLabel?: string;
	networkOrStudio?: string;
	overview?: string;
	alternateTitles?: string[];
	episodeOrMovieCount?: number;
	fileCount?: number;
	linkedAniListIds?: AniListId[];
}

export type MappingSearchResult =
	| ({ provider: "sonarr"; providerId: TvdbId } & MappingSearchResultBase)
	| ({ provider: "radarr"; providerId: TmdbId } & MappingSearchResultBase);

export type AnyMappingSearchResult = MappingSearchResultBase & {
	providerId: ProviderId;
};
