/** Mapping target and resolved mapping result types. */
// src/mapping/types.ts

import type { TmdbId, TvdbId } from "@/providers/schemas";

export type UpstreamTarget =
	| {
			provider: "sonarr";
			providerId: TvdbId;
			season?: number;
	  }
	| {
			provider: "radarr";
			providerId: TmdbId;
	  };

export type SeerrUpstreamTarget =
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
	  };

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
			targets: UpstreamTarget[];
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
			targets: UpstreamTarget[];
	  }
	| {
			kind: "unmapped";
			hadResolveAttempt: boolean;
			rejectedProviderIds?: number[];
	  };
