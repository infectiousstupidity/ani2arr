/** Mapping facts, source identity helpers, and resolved mapping result types. */
// src/mapping/types.ts

import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import {
	parseMyAnimeListIdOrNull,
	type MyAnimeListId,
} from "@/myanimelist/types";
import type { TmdbId, TvdbId } from "@/providers/schemas";

export type SourceProvider = "anilist" | "mal";

export type SourceIdentity =
	| { source: "anilist"; id: AniListId }
	| { source: "mal"; id: MyAnimeListId };

const SOURCE_IDENTITY_KEY_PATTERN = /^(anilist|mal):([1-9]\d*)$/;

export function sourceIdentityKey(identity: SourceIdentity): string {
	return `${identity.source}:${identity.id}`;
}

export function parseSourceIdentityKey(
	value: unknown,
): SourceIdentity | null {
	if (typeof value !== "string") return null;

	const match = SOURCE_IDENTITY_KEY_PATTERN.exec(value);
	if (!match) return null;

	const [, source, rawId] = match;
	const numericId = Number(rawId);

	if (source === "anilist") {
		const id = parseAniListIdOrNull(numericId);
		return id === null ? null : { source, id };
	}

	if (source === "mal") {
		const id = parseMyAnimeListIdOrNull(numericId);
		return id === null ? null : { source, id };
	}

	return null;
}

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
