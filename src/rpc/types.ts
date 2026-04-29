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
	ProviderId,
} from "@/providers";
import type {
	AcceptedMappingReason,
	AcceptedMappingSource,
	MappingUnknownReason,
	EffectiveMappingState,
} from "@/mapping/types";
import type { MappingListRow } from "@/mapping/queries/list-mappings";
import type { EffectiveMappingPresence } from "@/mapping/queries/mapping-identities";
import type { AutoMappingStatus } from "@/mapping/auto-mapping/types";
import type { MappingDetailsPayload } from "@/mapping/queries/mapping-details";
import type { LibraryUnknownReason } from "@/providers/library/types";
import type { MappingCursor } from "./schemas";
export type {
	ProviderLibraryStatus,
	RadarrLibraryStatus,
	SonarrLibraryStatus,
} from "@/providers/library/types";

interface ProviderStatusResponseBase {
	providerId: ProviderId | null;
	providerMappingState: EffectiveMappingState;
	isInLibrary: boolean | null;
	successfulSynonym?: string;
	mappingSource?: AcceptedMappingSource;
	mappingReason?: AcceptedMappingReason;
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
	mappings: MappingListRow[];
	nextCursor?: MappingCursor | null;
	total?: number;
}

export type GetMappingIdentitiesOutput = EffectiveMappingPresence[];

export type GetMappingInspectionOutput = MappingDetailsPayload;

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
