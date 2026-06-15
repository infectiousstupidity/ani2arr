/** Seerr request integration types for payloads, search, details, and status. */
// src/providers/seerr/types.ts

import type { TmdbId, TvdbId } from "@/providers/schemas";

export type SeerrMediaType = "movie" | "tv";
export type SeerrTargetSource = "manual" | "anibridge";

export type SeerrTvSeasons = "all" | number[];

export interface SeerrRequestPayload {
	mediaType: SeerrMediaType;
	mediaId: TmdbId;
	tvdbId?: number;
	seasons?: SeerrTvSeasons;
}

export interface SeerrRequestInput {
	mediaType: SeerrMediaType;
	tmdbId: unknown;
	tvdbId?: TvdbId;
	seasons?: SeerrTvSeasons;
}

export interface SeerrMediaStatusInput {
	mediaType: SeerrMediaType;
	tmdbId: TmdbId;
	seasons?: SeerrTvSeasons;
}

export type SeerrMediaStatus =
	| "not-requested"
	| "pending"
	| "processing"
	| "partial"
	| "available"
	| "deleted-or-blocked"
	| "deleted"
	| "unknown";

export interface SeerrSearchResult {
	mediaType: SeerrMediaType;
	tmdbId: TmdbId;
	title: string;
	year?: number;
	posterPath?: string | null;
	overview?: string | null;
}

export interface SeerrSeasonStatus {
	seasonNumber: number;
	name?: string;
	episodeCount?: number;
	status: SeerrMediaStatus;
	requestable: boolean;
}

export type SeerrMediaDetails = {
	mediaType: SeerrMediaType;
	tmdbId: TmdbId;
	tvdbId?: TvdbId;
	title: string;
	year?: number;
	posterPath?: string | null;
	backdropPath?: string | null;
	overview?: string | null;
	status: SeerrMediaStatus;
	seasons?: SeerrSeasonStatus[];
};

export interface SeerrMediaRequest {
	id: number;
	status: number;
	media?: {
		id?: number;
		tmdbId?: number;
		tvdbId?: number | null;
		status?: number;
	} | null;
}
