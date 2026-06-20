/** Shared React Query cache keys and pure input normalizers. */
// src/queries/query-keys.ts

import { isAniListId, type AniListId } from "@/anilist/types";
import { sourceIdentityKey, type SourceIdentity } from "@/mapping/types";
import type { Provider } from "@/providers/types";
import type { TmdbId } from "@/providers/schemas";
import type { SeerrMediaType, SeerrTvSeasons } from "@/providers/seerr/types";
import type { GetMappingsInput, StatusInput } from "@/rpc/types";
import { sourceFromInput, type SourceInputLike } from "@/rpc/source-input";

const rootQueryKey = ["a2a"] as const;
const configuredScope = "configured";

type MediaStatusKeyInput = Pick<
	StatusInput,
	"anilistId" | "metadata" | "source" | "title"
>;
type SeerrMediaStatusKeyInput = {
	mediaType: SeerrMediaType;
	tmdbId: TmdbId;
	seasons?: SeerrTvSeasons;
};
type SeerrMediaDetailsKeyInput = {
	mediaType: SeerrMediaType;
	tmdbId: TmdbId;
};
type SeerrLinkedAniListEntriesKeyInput = {
	mediaType: SeerrMediaType;
	tmdbId: TmdbId;
};
type SourceKeyInput = SourceInputLike | SourceIdentity | AniListId;

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

export const normalizeSourceKey = (source: SourceIdentity): string =>
	sourceIdentityKey(source);

const sourceKeyFromInput = (input: SourceKeyInput): string => {
	if (typeof input === "number") {
		return normalizeSourceKey({ source: "anilist", id: input });
	}
	if ("id" in input && "source" in input && typeof input.source === "string") {
		return normalizeSourceKey(input);
	}
	return normalizeSourceKey(sourceFromInput(input));
};

const normalizeSeerrSeasons = (
	seasons: SeerrTvSeasons | undefined,
): SeerrTvSeasons | undefined => {
	if (!Array.isArray(seasons)) return seasons;
	return [...new Set(seasons.filter((season) => Number.isSafeInteger(season)))]
		.toSorted((a, b) => a - b);
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
	mappingInspection: (provider: Provider, input: SourceKeyInput) =>
		[
			...rootQueryKey,
			"mapping",
			"inspection",
			provider,
			sourceKeyFromInput(input),
		] as const,
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
	seerrRoot: () => [...rootQueryKey, "seerr"] as const,
	seerrConnection: (scope = configuredScope) =>
		[...rootQueryKey, "seerr", "connection", scope] as const,
	seerrTargetsRoot: () => [...rootQueryKey, "seerr", "targets"] as const,
	seerrTarget: (anilistId: AniListId) =>
		[...rootQueryKey, "seerr", "target", anilistId] as const,
	seerrTargets: (ids: readonly AniListId[]) =>
		[...rootQueryKey, "seerr", "targets", normalizeMetadataIds(ids)] as const,
	seerrMediaStatus: (input: SeerrMediaStatusKeyInput | null) =>
		[
			...rootQueryKey,
			"seerr",
			"mediaStatus",
			input === null
				? null
				: {
						mediaType: input.mediaType,
						tmdbId: input.tmdbId,
						...(input.seasons === undefined
							? {}
							: { seasons: normalizeSeerrSeasons(input.seasons) }),
					},
		] as const,
	seerrMediaDetails: (input: SeerrMediaDetailsKeyInput | null) =>
		[
			...rootQueryKey,
			"seerr",
			"mediaDetails",
			input === null
				? null
				: {
						mediaType: input.mediaType,
						tmdbId: input.tmdbId,
					},
		] as const,
	seerrLinkedAniListEntriesRoot: () =>
		[...rootQueryKey, "seerr", "linkedAniListEntries"] as const,
	seerrLinkedAniListEntries: (
		input: SeerrLinkedAniListEntriesKeyInput | null,
	) =>
		[
			...rootQueryKey,
			"seerr",
			"linkedAniListEntries",
			input === null
				? null
				: {
						mediaType: input.mediaType,
						tmdbId: input.tmdbId,
					},
		] as const,
	seerrSearch: (query: string) =>
		[...rootQueryKey, "seerr", "search", normalizeText(query)] as const,
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
	providerMediaStatusItem: (provider: Provider, input: SourceKeyInput) =>
		[
			...rootQueryKey,
			"provider",
			provider,
			"mediaStatus",
			sourceKeyFromInput(input),
		] as const,
	providerMediaStatus: (provider: Provider, input: MediaStatusKeyInput) =>
		[
			...rootQueryKey,
			"provider",
			provider,
			"mediaStatus",
			sourceKeyFromInput(input),
			{
				...(input.title === undefined ? {} : { title: input.title }),
				...(input.metadata === undefined ? {} : { metadata: input.metadata }),
			},
		] as const,
};
