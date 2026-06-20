/** Plain payload and response types used by RPC and adjacent provider flows. */
// src/rpc/types.ts

import type {
	AniListId,
	AniListMediaHint,
	AniListMediaFormat,
	AniListMetadata,
} from "@/anilist/types";
import type { Provider, ProviderCredentials } from "@/providers/types";
import type { ProviderOpenTarget } from "@/providers/provider-links";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import type {
	RadarrMovieSnapshot,
	RadarrLookupMovie,
	RadarrMovie,
} from "@/providers/radarr/types";
import type { TmdbId, TvdbId } from "@/providers/schemas";
import type {
	SeerrMediaDetails,
	SeerrMediaRequest,
	SeerrMediaStatus,
	SeerrSearchResult,
	SeerrTargetSource,
	SeerrTvSeasons,
} from "@/providers/seerr/types";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import type { SonarrEditMonitoringAction } from "@/providers/sonarr/schemas";
import type {
	SonarrLookupSeries,
	SonarrSeries,
	SonarrSeriesSnapshot,
} from "@/providers/sonarr/types";
import type { MappingResult, MappingSource, SourceIdentity } from "@/mapping/types";

export type ProviderExternalId = TvdbId | TmdbId;

export type SourceRpcInput =
	| {
			source: SourceIdentity;
			anilistId?: AniListId;
	  }
	| {
			/** LEGACY: AniList callers migrate to source in MAL content phases. */
			anilistId: AniListId;
			source?: never;
	  };

export type StatusInput = SourceRpcInput & {
	title?: string;
	force_verify?: boolean;
	force_mapping_retry?: boolean;
	metadata?: AniListMediaHint | null;
};

export type AddSonarrInput = {
	anilistId: AniListId;
	source?: SourceIdentity;
	tvdbId: TvdbId;
	title: string;
	primaryTitleHint?: string;
	metadata?: AniListMediaHint | null;
	form: SonarrFormState;
};

export type UpdateSonarrInput = {
	anilistId: AniListId;
	source?: SourceIdentity;
	tvdbId: TvdbId;
	title: string;
	form: SonarrFormState;
	monitoringAction?: SonarrEditMonitoringAction;
};

export type AddRadarrInput = {
	anilistId: AniListId;
	source?: SourceIdentity;
	tmdbId: TmdbId;
	title: string;
	primaryTitleHint?: string;
	metadata?: AniListMediaHint | null;
	form: RadarrFormState;
};

export type UpdateRadarrInput = {
	anilistId: AniListId;
	source?: SourceIdentity;
	tmdbId: TmdbId;
	title: string;
	form: RadarrFormState;
};

export type SetManualMappingInput = SourceRpcInput & {
	force?: boolean;
} & (
	| { provider: "sonarr"; providerId: TvdbId }
	| { provider: "radarr"; providerId: TmdbId }
);

export type ClearManualMappingInput = SourceRpcInput & {
	provider: Provider;
};

export type SetMappingIgnoreInput = ClearManualMappingInput;
export type ClearMappingIgnoreInput = ClearManualMappingInput;

export type SetMappingRejectedCandidateInput = SourceRpcInput &
	(
	| { provider: "sonarr"; providerId: TvdbId }
	| { provider: "radarr"; providerId: TmdbId }
);

export type ClearMappingRejectedCandidateInput =
	SetMappingRejectedCandidateInput;

export type SonarrLookupInput = {
	term: string;
};

export type RadarrLookupInput = {
	term: string;
};

export type ValidateTvdbInput = {
	tvdbId: TvdbId;
};

export type ValidateTmdbInput = {
	tmdbId: TmdbId;
};

export type GetMappingsInput = {
	providers?: Provider[];
	statuses?: MappingListRowStatus[];
	source?: MappingSource;
	limit?: number;
	query?: string;
};

export type GetMappingIdentitiesInput = AniListId[];
export type GetSeerrTargetsInput = AniListId[];
export type GetSeerrTargetInput = AniListId;

export type GetMappingInspectionInput = {
	anilistId: AniListId;
	provider: Provider;
};

export type GetAniListMetadataInput = {
	ids: AniListId[];
};

export type GetAniListIdForSourceInput = SourceIdentity;

export type GetAniListIdForSourceOutput = AniListId | null;

export type ProviderConnectionTestInput = {
	credentials: ProviderCredentials;
};

export type RequestInSeerrInput =
	| {
			anilistId: AniListId;
			mediaType: "movie";
			tmdbId: TmdbId;
	  }
	| {
			anilistId: AniListId;
			mediaType: "tv";
			tmdbId: TmdbId;
			tvdbId?: TvdbId;
			seasons: number[];
	  };

export type GetSeerrMediaStatusInput =
	| {
			mediaType: "movie";
			tmdbId: TmdbId;
	  }
	| {
			mediaType: "tv";
			tmdbId: TmdbId;
			seasons?: SeerrTvSeasons;
	  };

export type GetSeerrMediaStatusOutput = {
	status: SeerrMediaStatus;
};

export type SeerrRequestTarget = {
	anilistId: AniListId;
	source: SeerrTargetSource;
} & (
	| {
			mediaType: "movie";
			tmdbId: TmdbId;
	  }
	| {
			mediaType: "tv";
			tmdbId: TmdbId;
			seasons: number[];
			tmdbSeasons?: number[];
			tvdbSeasons?: number[];
			tvdbId?: TvdbId;
	  }
);

export type SetManualSeerrTargetInput = {
	anilistId: AniListId;
} & (
	| {
			mediaType: "movie";
			tmdbId: TmdbId;
	  }
	| {
			mediaType: "tv";
			tmdbId: TmdbId;
			tvdbId?: TvdbId;
			seasons: number[];
	  }
);

export type ClearManualSeerrTargetInput = AniListId;

export type SearchSeerrMediaInput = {
	query: string;
};

export type SearchSeerrMediaOutput = SeerrSearchResult[];

export type GetSeerrMediaDetailsInput =
	| {
			mediaType: "movie";
			tmdbId: TmdbId;
	  }
	| {
			mediaType: "tv";
			tmdbId: TmdbId;
	  };

export type GetSeerrMediaDetailsOutput = SeerrMediaDetails;

export type GetSeerrLinkedAniListEntriesInput =
	| {
			mediaType: "movie";
			tmdbId: TmdbId;
	  }
	| {
			mediaType: "tv";
			tmdbId: TmdbId;
	  };

export type GetSeerrLinkedAniListEntriesOutput =
	MappingDetailsLinkedAniListEntry[];

export type OpenProviderPageInput = {
	provider: Provider;
	target: ProviderOpenTarget;
};

export type OpenProviderPageOutput = {
	opened: boolean;
};

export type OpenSeerrPageInput = {
	mediaType: "movie" | "tv";
	tmdbId: TmdbId;
};

export type OpenSeerrPageOutput = OpenProviderPageOutput;

export type NotifyProviderConnectionChangedInput = {
	changedProviders?: Provider[];
	disconnectedProviders?: Provider[];
};

export type GetProviderFormResourcesInput = {
	credentials?: ProviderCredentials;
};

interface ProviderStatusResponseBase {
	mapping: MappingResult;
	isInLibrary: boolean | null;
}

export interface GetSeriesStatusOutput extends ProviderStatusResponseBase {
	series?: SonarrSeriesSnapshot | SonarrSeries | SonarrLookupSeries;
}

export interface GetMovieStatusOutput extends ProviderStatusResponseBase {
	movie?: RadarrMovieSnapshot | RadarrMovie | RadarrLookupMovie;
}

export type RequestInSeerrOutput = SeerrMediaRequest;

export type MappingListRowStatus =
	| "needs-review"
	| "in-library"
	| "can-add"
	| "suppressed"
	| "unmapped"
	| "unknown";

export interface MappingListProviderMeta {
	title?: string;
	type?: "series" | "movie";
	statusLabel?: string;
	providerRouteSlug?: string;
}

export interface MappingListRow {
	anilistId: AniListId;
	provider: Provider;
	result: MappingResult;
	providerId: ProviderExternalId | null;
	isInLibrary: boolean | null;
	mappingRowStatus: MappingListRowStatus;
	providerMeta?: MappingListProviderMeta;
}

export interface MappingListGroup {
	key: string;
	provider: Provider;
	providerId: ProviderExternalId | null;
	rows: MappingListRow[];
	linkedAniListIds: readonly AniListId[];
	isInLibrary: boolean | null;
	providerMeta?: MappingListProviderMeta;
}

export interface GetMappingsOutput {
	groups: MappingListGroup[];
	total: number;
}

export interface MappingIdentity {
	anilistId: AniListId;
	provider: Provider;
	result: MappingResult;
}

export type GetMappingIdentitiesOutput = MappingIdentity[];

export interface MappingDetailsLinkedAniListEntry {
	anilistId: AniListId;
	title?: string;
	format?: AniListMediaFormat | null;
	year?: number | null;
	coverImage?: string | null;
	relation?: "current";
}

export interface MappingDetailsPayload {
	mapping: MappingResult;
	linkedAniListEntries: readonly MappingDetailsLinkedAniListEntry[];
}

export type GetMappingInspectionOutput = MappingDetailsPayload;

export interface SonarrLookupOutput {
	results: SonarrLookupSeries[];
	libraryTvdbIds: number[];
	linkedAniListIdsByTvdbId?: Record<number, number[]>;
	statsMap?: Record<
		number,
		{
			episodeCount?: number | undefined;
			episodeFileCount?: number | undefined;
			totalEpisodeCount?: number | undefined;
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
