/** Mapping target and resolved mapping result types. */
// src/mapping/types.ts

import type { TmdbId, TvdbId } from "@/providers/schemas";
import type { SeerrTarget } from "./seerr-target";

export type AniBridgeTarget =
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

export type AniBridgeEntries = Record<string, AniBridgeTarget[]>;

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
	| Extract<SeerrTarget, { mediaType: "movie" }>
	| (Extract<SeerrTarget, { mediaType: "tv" }> & {
			tmdbSeasons?: number[];
			tvdbSeasons?: number[];
	  });

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
