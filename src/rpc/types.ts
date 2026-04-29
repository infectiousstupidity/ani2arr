/** Plain payload and response types used by RPC and adjacent provider flows without runtime schemas. */
// src/rpc/types.ts

import type { AniListMetadata } from "@/anilist/schemas/metadata.schema";
import type {
	RadarrMovieSnapshot,
	RadarrLookupMovie,
	RadarrMovie,
	SonarrSeriesSnapshot,
	SonarrLookupSeries,
	SonarrSeries,
	ProviderTargetId,
} from "@/providers";
import type {
	MappingAcceptedReason,
	MappingAcceptedSource,
	MappingIdentity,
	MappingUnknownReason,
	ProviderMappingState,
} from "@/mapping/types";
import type { MappingSummary } from "@/mapping/queries/list-mappings";
import type { AutoMappingStatus } from "@/mapping/auto-mapping/types";
import type { MappingInspectionPayload } from "@/mapping/queries/mapping-details";
import type { LibraryUnknownReason } from "@/providers/library/types";
import type { MappingCursor } from "./schemas";
export type {
	ProviderLibraryStatus,
	RadarrLibraryStatus,
	SonarrLibraryStatus,
} from "@/providers/library/types";

interface ProviderStatusResponseBase {
	providerId: ProviderTargetId | null;
	providerMappingState: ProviderMappingState;
	isInLibrary: boolean | null;
	successfulSynonym?: string;
	mappingSource?: MappingAcceptedSource;
	mappingReason?: MappingAcceptedReason;
	resolverOutcome?: AutoMappingStatus;
	mappingUnknownReason?: MappingUnknownReason;
	libraryUnknownReason?: LibraryUnknownReason;
	/** True when a manual AniList -> provider manual mapping is active for this ID. */
	manualMappingActive?: boolean;
	/** Other AniList IDs currently linked to the same provider ID. */
	linkedAniListIds?: number[];
}

export interface CheckSeriesStatusResponse extends ProviderStatusResponseBase {
	series?: SonarrSeriesSnapshot | SonarrSeries | SonarrLookupSeries;
}

export interface CheckMovieStatusResponse extends ProviderStatusResponseBase {
	movie?: RadarrMovieSnapshot | RadarrMovie | RadarrLookupMovie;
}

export interface GetMappingsOutput {
	mappings: MappingSummary[];
	nextCursor?: MappingCursor | null;
	total?: number;
}

export type GetMappingIdentitiesOutput = MappingIdentity[];

export type GetMappingInspectionOutput = MappingInspectionPayload;

export interface SonarrLookupOutput {
	results: SonarrLookupSeries[];
	libraryTvdbIds: number[];
	linkedAniListIdsByTvdbId?: Record<number, number[]>;
	statsMap?: Record<
		number,
		{
			episodeCount?: number;
			episodeFileCount?: number;
			totalEpisodeCount?: number;
		}
	>;
}

export interface RadarrLookupOutput {
	results: RadarrLookupMovie[];
	libraryTmdbIds: number[];
	linkedAniListIdsByTmdbId?: Record<number, number[]>;
}

export interface GetAniListMetadataOutput {
	metadata: AniListMetadata[];
	missingIds?: number[];
}
