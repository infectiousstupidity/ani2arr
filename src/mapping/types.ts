/** Mapping target and resolved mapping result types. */
// src/mapping/types.ts

import type { AniListId } from "@/anilist/types";
import type { TmdbId, TvdbId } from "@/providers/schemas";
import type { SeerrTargetWithEvidence } from "./seerr-target";

export type UpstreamTarget =
	| {
			kind: "tmdb-movie";
			id: TmdbId;
	  }
	| {
			kind: "tmdb-show";
			id: TmdbId;
			season?: number;
	  }
	| {
			kind: "tvdb-show";
			id: TvdbId;
			season?: number;
	  };

export type UpstreamSourceRecord = {
	linkedAniListId?: AniListId;
	targets: UpstreamTarget[];
};

export type UpstreamSourceRecords = Record<string, UpstreamSourceRecord>;

export type ArrUpstreamTarget =
	| {
			provider: "sonarr";
			providerId: TvdbId;
			season?: number;
	  }
	| {
			provider: "radarr";
			providerId: TmdbId;
	  };

export type SeerrUpstreamTarget = SeerrTargetWithEvidence;

export type AutoResult =
	| {
			kind: "mapped";
			providerId: number;
			season?: number;
			matchedTitle?: string;
	  }
	| {
			kind: "unmapped";
	  }
	| {
			kind: "ambiguous";
			targets: ArrUpstreamTarget[];
	  };

export type MappingSource = "manual" | "upstream" | "auto";

export type MappingResult =
	| {
			kind: "mapped";
			source: MappingSource;
			providerId: number;
			season?: number;
			matchedTitle?: string;
	  }
	| {
			kind: "ignored";
	  }
	| {
			kind: "ambiguous";
			targets: ArrUpstreamTarget[];
	  }
	| {
			kind: "unmapped";
			hadResolveAttempt: boolean;
			rejectedProviderIds?: number[];
	  };
