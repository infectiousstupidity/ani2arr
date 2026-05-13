/** Shared query keys and stable AniList metadata serialization for query caching. */
// src/shared/queries/query-keys.ts

import type { AniListId } from "@/anilist";
import { isAniListId } from "@/anilist/anilist-id";
import type { StatusInput, GetMappingsInput } from "@/rpc/schemas";
import type { AniListMediaHint } from "@/anilist/schemas/media.schema";
import type { Provider, TmdbId, TvdbId } from "@/providers";
import type { ProviderExternalId } from "@/mapping/types";

const rootQueryKey = ["a2a"] as const;

// Normalize strings to ensure "Show Name" and "show name " hit the same cache
const normalizeTitleKey = (title?: string) => {
	const trimmed = title?.trim();
	return trimmed ? trimmed.toLowerCase() : "::";
};

// Create a deterministic subset of metadata for cache stability.
// This prevents cache misses caused by:
// 1. Reference instability (new objects with same content)
// 2. undefined vs null inconsistencies
// 3. Unstable array ordering (prequel IDs)
// 4. Irrelevant fields (coverImage, etc.)
const getStableMetadata = (metadata?: AniListMediaHint | null) => {
	if (!metadata) return null;
	return {
		titles: {
			english: metadata.titles?.english?.trim() || null,
			romaji: metadata.titles?.romaji?.trim() || null,
			native: metadata.titles?.native?.trim() || null,
		},
		startYear: metadata.startYear ?? null,
		format: metadata.format ?? null,
		// Limit synonyms to 5 to match backend matching logic and reduce cache fragmentation
		synonyms: (metadata.synonyms || []).slice(0, 5),
		// Sort numeric IDs to ensure array order doesn't affect cache identity
		relationPrequelIds: [...(metadata.relationPrequelIds || [])].toSorted(
			(a, b) => a - b,
		),
	};
};

const seriesStatusRootKey = (provider: Provider) =>
	[...rootQueryKey, "seriesStatus", provider] as const;

const seriesStatusBaseKey = (provider: Provider, anilistId: AniListId) =>
	[...seriesStatusRootKey(provider), anilistId] as const;

const providerFormOptionsRootKey = (provider: Provider) =>
	[...rootQueryKey, `${provider}FormOptions`] as const;

const normalizeMappingsInput = (input?: GetMappingsInput) => {
	if (!input) return "default";
	const normalized: Record<string, unknown> = {};
	if (input.entryKinds?.length) {
		normalized.entryKinds = [...new Set(input.entryKinds)].toSorted();
	}
	if (input.providers?.length) {
		normalized.providers = [...new Set(input.providers)].toSorted();
	}
	if (typeof input.limit === "number") {
		normalized.limit = input.limit;
	}
	if (input.query && input.query.trim()) {
		normalized.query = input.query.trim().toLowerCase();
	}
	if (input.cursor) {
		normalized.cursor = {
			updatedAt: input.cursor.updatedAt,
			anilistId: input.cursor.anilistId,
			provider: input.cursor.provider,
		};
	}
	return normalized;
};

export const normalizeMetadataIds = (
	ids: readonly AniListId[],
): AniListId[] => {
	return [...new Set(ids.filter(isAniListId))].toSorted((a, b) => a - b);
};

export const queryKeys = {
	all: rootQueryKey,
	options: () => [...rootQueryKey, "options"] as const,
	publicOptions: () => [...rootQueryKey, "publicOptions"] as const,
	providerBaseUrl: (provider: Provider) =>
		[...rootQueryKey, "providerBaseUrl", provider] as const,
	aniListMedia: (anilistId: AniListId) =>
		[...rootQueryKey, "aniListMedia", anilistId] as const,
	seriesStatusRoot: (provider: Provider = "sonarr") =>
		seriesStatusRootKey(provider),
	seriesStatusBase: (anilistId: AniListId, provider: Provider = "sonarr") =>
		seriesStatusBaseKey(provider, anilistId),
	seriesStatus: (
		payload: Pick<StatusInput, "anilistId" | "title" | "metadata">,
		provider: Provider = "sonarr",
	) =>
		[
			...seriesStatusBaseKey(provider, payload.anilistId),
			{
				// TanStack Query hashes this object. By using normalized inputs,
				// we ensure cache hits across different contexts (e.g. Card vs Page).
				title: normalizeTitleKey(payload.title),
				metadata: getStableMetadata(payload.metadata),
			},
		] as const,
	providerLibraryStatus: (
		provider: Provider,
		anilistId: AniListId,
		providerId: ProviderExternalId,
	) =>
		[
			...seriesStatusBaseKey(provider, anilistId),
			"providerLibraryStatus",
			providerId,
		] as const,
	sonarrSeriesLibraryStatus: (tvdbId: TvdbId | null) =>
		[...rootQueryKey, "sonarrSeriesLibraryStatus", tvdbId] as const,
	radarrMovieLibraryStatus: (tmdbId: TmdbId | null) =>
		[...rootQueryKey, "radarrMovieLibraryStatus", tmdbId] as const,
	sonarrFormOptionsRoot: () => providerFormOptionsRootKey("sonarr"),
	sonarrFormOptions: (scope?: string) =>
		[...rootQueryKey, "sonarrFormOptions", scope ?? "configured"] as const,
	sonarrConnectionRoot: () => [...rootQueryKey, "sonarrConnection"] as const,
	sonarrConnection: (scope?: string) =>
		[...rootQueryKey, "sonarrConnection", scope ?? "configured"] as const,
	radarrFormOptionsRoot: () => providerFormOptionsRootKey("radarr"),
	radarrFormOptions: (scope?: string) =>
		[...rootQueryKey, "radarrFormOptions", scope ?? "configured"] as const,
	radarrConnectionRoot: () => [...rootQueryKey, "radarrConnection"] as const,
	radarrConnection: (scope?: string) =>
		[...rootQueryKey, "radarrConnection", scope ?? "configured"] as const,
	mappingSearchRoot: (provider?: Provider) =>
		provider
			? ([...rootQueryKey, "mappingSearch", provider] as const)
			: ([...rootQueryKey, "mappingSearch"] as const),
	mappingSearch: (service: "sonarr" | "radarr", query: string) =>
		[
			...rootQueryKey,
			"mappingSearch",
			service,
			query.trim().toLowerCase(),
		] as const,
	mappingsRoot: () => [...rootQueryKey, "mappings"] as const,
	mappings: (input?: GetMappingsInput) =>
		[...rootQueryKey, "mappings", normalizeMappingsInput(input)] as const,
	mappingIdentitiesRoot: () => [...rootQueryKey, "mappingIdentities"] as const,
	mappingIdentities: (ids: readonly AniListId[]) =>
		[...rootQueryKey, "mappingIdentities", normalizeMetadataIds(ids)] as const,
	mappingInspectionRoot: () => [...rootQueryKey, "mappingInspection"] as const,
	mappingInspection: (provider: Provider, anilistId: AniListId) =>
		[...rootQueryKey, "mappingInspection", provider, anilistId] as const,
	aniListMetadata: (ids: readonly AniListId[]) =>
		[...rootQueryKey, "aniListMetadata", normalizeMetadataIds(ids)] as const,
};
