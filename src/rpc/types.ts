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
	SeerrAccountSummary,
	SeerrConnection,
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
import type { ActiveMappingIdentity } from "@/mapping/list-mappings";
import type { SourceIdentity } from "@/mapping/source-identity";
import type { MappingResult } from "@/mapping/types";
import type { PublicOptions } from "@/settings/types";

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

export type AddSonarrInput = SourceRpcInput & {
	tvdbId: TvdbId;
	title: string;
	primaryTitleHint?: string;
	metadata?: AniListMediaHint | null;
	form: SonarrFormState;
};

export type UpdateSonarrInput = SourceRpcInput & {
	tvdbId: TvdbId;
	title: string;
	form: SonarrFormState;
	monitoringAction?: SonarrEditMonitoringAction;
};

export type AddRadarrInput = SourceRpcInput & {
	tmdbId: TmdbId;
	title: string;
	primaryTitleHint?: string;
	metadata?: AniListMediaHint | null;
	form: RadarrFormState;
};

export type UpdateRadarrInput = SourceRpcInput & {
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

export type GetMappingIdentitiesInput = AniListId[];
/** Seerr target/request APIs are AniList-only until source-only Seerr UI exists. */
export type GetSeerrTargetsInput = AniListId[];
export type GetSeerrTargetInput = AniListId;

export type GetMappingInspectionInput = {
	provider: Provider;
} & SourceRpcInput;

export type GetAniListMetadataInput = {
	ids: AniListId[];
};

export type ProviderConnectionTestInput = {
	credentials: ProviderCredentials;
};

export type CheckSeerrSessionInput = {
	url: string;
};

export type TestSeerrApiKeyConnectionInput = {
	url: string;
	apiKey: string;
};

export type SeerrConnectionCheckOutput = {
	account: SeerrAccountSummary;
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

export type SavePublicOptionsInput = PublicOptions;

export type SaveProviderConnectionInput = {
	provider: Provider;
	credentials: ProviderCredentials | null;
};

export type SaveSeerrConnectionInput = {
	connection: SeerrConnection | null;
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
	statusLabel?: string;
	providerRouteSlug?: string;
}

export interface MappingListRow {
	anilistId: AniListId;
	aliases?: SourceIdentity[];
	provider: Provider;
	result: MappingResult;
	mappingRowStatus: MappingListRowStatus;
	providerMeta?: MappingListProviderMeta;
}

export interface MappingListGroup {
	key: string;
	provider: Provider;
	providerId: ProviderExternalId | null;
	rows: MappingListRow[];
	isInLibrary: boolean | null;
	providerMeta?: MappingListProviderMeta;
}

export type MappingIdentity = ActiveMappingIdentity;

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
	source: SourceIdentity;
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
