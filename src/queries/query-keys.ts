/** Shared query keys for React Query caches. */
// src/queries/query-keys.ts

import { isAniListId, type AniListId } from "@/anilist/types";
import type { GetMappingsInput } from "@/rpc/types";
import type { Provider } from "@/providers/types";

const rootQueryKey = ["a2a"] as const;

const mediaStatusProviderKey = (provider: Provider) =>
	[...rootQueryKey, "mediaStatus", provider] as const;

const mediaStatusItemKey = (provider: Provider, anilistId: AniListId) =>
	[...mediaStatusProviderKey(provider), anilistId] as const;

const providerFormResourcesRootKey = (provider: Provider) =>
	[...rootQueryKey, `${provider}FormResources`] as const;

const normalizeMappingsInput = (input?: GetMappingsInput) => {
	if (!input) return "default";
	const normalized: Record<string, unknown> = {};
	if (input.providers?.length) {
		normalized.providers = [...new Set(input.providers)].toSorted();
	}
	if (input.statuses?.length) {
		normalized.statuses = [...new Set(input.statuses)].toSorted();
	}
	if (typeof input.limit === "number") {
		normalized.limit = input.limit;
	}
	if (input.query && input.query.trim()) {
		normalized.query = input.query.trim().toLowerCase();
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
	mediaStatusProvider: (provider: Provider) => mediaStatusProviderKey(provider),
	mediaStatusItem: (provider: Provider, anilistId: AniListId) =>
		mediaStatusItemKey(provider, anilistId),
	mediaStatus: (provider: Provider, anilistId: AniListId) =>
		mediaStatusItemKey(provider, anilistId),
	sonarrFormResourcesRoot: () => providerFormResourcesRootKey("sonarr"),
	sonarrFormResources: (scope?: string) =>
		[...rootQueryKey, "sonarrFormResources", scope ?? "configured"] as const,
	sonarrConnectionRoot: () => [...rootQueryKey, "sonarrConnection"] as const,
	sonarrConnection: (scope?: string) =>
		[...rootQueryKey, "sonarrConnection", scope ?? "configured"] as const,
	radarrFormResourcesRoot: () => providerFormResourcesRootKey("radarr"),
	radarrFormResources: (scope?: string) =>
		[...rootQueryKey, "radarrFormResources", scope ?? "configured"] as const,
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
