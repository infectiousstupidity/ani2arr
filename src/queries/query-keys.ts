/** Shared React Query cache keys and pure input normalizers. */
// src/queries/query-keys.ts

import { isAniListId, type AniListId } from "@/anilist/types";
import type { Provider } from "@/providers/types";
import type { GetMappingsInput, StatusInput } from "@/rpc/types";

const rootQueryKey = ["a2a"] as const;
const configuredScope = "configured";

type MediaStatusKeyInput = Pick<StatusInput, "anilistId" | "title" | "metadata">;

const normalizeText = (value: string): string => value.trim().toLowerCase();

const normalizeMappingsInput = (input?: GetMappingsInput) => {
	if (!input) return "default";
	const normalized: Record<string, unknown> = {};
	if (input.providers?.length) {
		normalized.providers = [...new Set(input.providers)].toSorted();
	}
	if (input.statuses?.length) {
		normalized.statuses = [...new Set(input.statuses)].toSorted();
	}
	if (input.source) {
		normalized.source = input.source;
	}
	if (typeof input.limit === "number") {
		normalized.limit = input.limit;
	}
	if (input.query?.trim()) {
		normalized.query = normalizeText(input.query);
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
	options: () => [...rootQueryKey, "options", "extension"] as const,
	publicOptions: () => [...rootQueryKey, "options", "public"] as const,
	aniListMedia: (anilistId: AniListId) =>
		[...rootQueryKey, "anilist", "media", anilistId] as const,
	aniListMediaPlaceholder: () =>
		[...rootQueryKey, "anilist", "media", 0] as const,
	aniListMetadata: (ids: readonly AniListId[]) =>
		[...rootQueryKey, "anilist", "metadata", normalizeMetadataIds(ids)] as const,
	mappingsRoot: () => [...rootQueryKey, "mapping", "list"] as const,
	mappings: (input?: GetMappingsInput) =>
		[...rootQueryKey, "mapping", "list", normalizeMappingsInput(input)] as const,
	mappingIdentitiesRoot: () =>
		[...rootQueryKey, "mapping", "identities"] as const,
	mappingIdentities: (ids: readonly AniListId[]) =>
		[
			...rootQueryKey,
			"mapping",
			"identities",
			normalizeMetadataIds(ids),
		] as const,
	mappingInspectionRoot: () =>
		[...rootQueryKey, "mapping", "inspection"] as const,
	mappingInspection: (provider: Provider, anilistId: AniListId) =>
		[...rootQueryKey, "mapping", "inspection", provider, anilistId] as const,
	providerRoot: (provider: Provider) =>
		[...rootQueryKey, "provider", provider] as const,
	providerConnection: (provider: Provider, scope = configuredScope) =>
		[
			...rootQueryKey,
			"provider",
			provider,
			"connection",
			scope,
		] as const,
	providerFormResources: (provider: Provider, scope = configuredScope) =>
		[
			...rootQueryKey,
			"provider",
			provider,
			"formResources",
			scope,
		] as const,
	providerLookupRoot: (provider: Provider) =>
		[...rootQueryKey, "provider", provider, "lookup"] as const,
	providerLookup: (provider: Provider, term: string) =>
		[...rootQueryKey, "provider", provider, "lookup", normalizeText(term)] as const,
	providerMediaStatusRoot: (provider: Provider) =>
		[...rootQueryKey, "provider", provider, "mediaStatus"] as const,
	providerMediaStatusItem: (provider: Provider, anilistId: AniListId) =>
		[
			...rootQueryKey,
			"provider",
			provider,
			"mediaStatus",
			anilistId,
		] as const,
	providerMediaStatus: (provider: Provider, input: MediaStatusKeyInput) =>
		[
			...rootQueryKey,
			"provider",
			provider,
			"mediaStatus",
			input.anilistId,
			{
				...(input.title === undefined ? {} : { title: input.title }),
				...(input.metadata === undefined ? {} : { metadata: input.metadata }),
			},
		] as const,
};
