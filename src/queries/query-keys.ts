import type { AnimeFormat } from "@/shared/types/anime-format";
/** Shared React Query cache keys and pure input normalizers. */
// src/queries/query-keys.ts

import {
	type AniListId,
	type AniListTitles,
	isAniListId,
} from "@/anilist/types";
import { normalizeSeasonNumbers } from "@/mapping/season-numbers";
import {
	type SourceIdentity,
	sourceIdentityKey,
} from "@/mapping/source-identity";
import type { MyAnimeListId } from "@/myanimelist/types";
import type { TmdbId } from "@/providers/schemas";
import type { SeerrMediaType } from "@/providers/seerr/types";
import type { Provider } from "@/providers/types";
import type {
	GetMappingInspectionInput,
	GetSeerrMediaStatusInput,
	GetSeerrTargetInput,
	GetSeerrTargetsInput,
	SearchSeerrMediaInput,
	StatusInput,
} from "@/rpc/types";

const rootQueryKey = ["a2a"] as const;
const configuredScope = "configured";
const mappingRootKey = () => [...rootQueryKey, "mapping"] as const;
const seerrTargetsRootKey = () =>
	[...rootQueryKey, "seerr", "targets"] as const;

type SeerrMediaDetailsKeyInput = {
	mediaType: SeerrMediaType;
	tmdbId: TmdbId;
};
type SeerrLinkedAniListEntriesKeyInput = {
	mediaType: SeerrMediaType;
	tmdbId: TmdbId;
};

type NormalizedResolverMetadata = {
	titles?: {
		english?: string;
		romaji?: string;
		native?: string;
	};
	synonyms?: string[];
	startYear?: number;
	format?: AnimeFormat;
	relationPrequelIds?: AniListId[];
};

type NormalizedMediaStatusRequest = {
	source: SourceIdentity;
	title?: string;
	metadata?: NormalizedResolverMetadata;
};

type NormalizedSeerrTargetRequest = {
	source: SourceIdentity;
	mediaType: "movie" | "tv";
	title?: string;
	metadata?: NormalizedResolverMetadata;
};

type NormalizedMappingInspectionRequest = GetMappingInspectionInput;

type NormalizedProviderLookupRequest = { term: string };

type NormalizedSeerrSearchRequest = SearchSeerrMediaInput;

type NormalizedSeerrMediaStatusRequest =
	| { mediaType: "movie"; tmdbId: TmdbId }
	| { mediaType: "tv"; tmdbId: TmdbId; seasons?: number[] };

const normalizeResourceText = (value: string): string | undefined => {
	const normalized = value.trim().replaceAll(/\s+/g, " ");
	return normalized.length === 0 ? undefined : normalized;
};

const normalizeTextList = (values: readonly string[]): string[] =>
	[
		...new Set(
			values
				.map((value) => normalizeResourceText(value))
				.filter((value): value is string => value !== undefined),
		),
	].toSorted();

const normalizeResolverTitles = (
	titles: AniListTitles | null | undefined,
): NormalizedResolverMetadata["titles"] => {
	const english = normalizeResourceText(titles?.english ?? "");
	const romaji = normalizeResourceText(titles?.romaji ?? "");
	const native = normalizeResourceText(titles?.native ?? "");
	const normalized = {
		...(english === undefined ? {} : { english }),
		...(romaji === undefined ? {} : { romaji }),
		...(native === undefined ? {} : { native }),
	};
	return Object.keys(normalized).length === 0 ? undefined : normalized;
};

const normalizeResolverMetadata = (
	metadata: StatusInput["metadata"],
	includeRelationPrequelIds: boolean,
): NormalizedResolverMetadata | undefined => {
	if (!metadata) return undefined;

	const titles = normalizeResolverTitles(metadata.titles);
	const synonyms = normalizeTextList(metadata.synonyms ?? []);
	const relationPrequelIds =
		includeRelationPrequelIds && metadata.relationPrequelIds
			? [...new Set(metadata.relationPrequelIds.filter(isAniListId))].toSorted(
					(left, right) => left - right,
				)
			: [];
	const normalized: NormalizedResolverMetadata = {
		...(titles === undefined ? {} : { titles }),
		...(synonyms.length === 0 ? {} : { synonyms }),
		...(typeof metadata.startYear === "number"
			? { startYear: metadata.startYear }
			: {}),
		...(metadata.format == null ? {} : { format: metadata.format }),
		...(relationPrequelIds.length === 0 ? {} : { relationPrequelIds }),
	};

	return Object.keys(normalized).length === 0 ? undefined : normalized;
};

const normalizeMediaStatusRequest = (
	input: Pick<StatusInput, "source" | "metadata" | "title">,
	includeRelationPrequelIds: boolean,
): NormalizedMediaStatusRequest => {
	const title = normalizeResourceText(input.title ?? "");
	const metadata = normalizeResolverMetadata(
		input.metadata,
		includeRelationPrequelIds,
	);
	return {
		source: input.source,
		...(title === undefined ? {} : { title }),
		...(metadata === undefined ? {} : { metadata }),
	};
};

export const normalizeSonarrStatusRequest = (
	input: Pick<StatusInput, "source" | "metadata" | "title">,
): NormalizedMediaStatusRequest => normalizeMediaStatusRequest(input, true);

export const normalizeRadarrStatusRequest = (
	input: Pick<StatusInput, "source" | "metadata" | "title">,
): NormalizedMediaStatusRequest => normalizeMediaStatusRequest(input, false);

export function normalizeSeerrTargetRequest(
	input: GetSeerrTargetInput,
): NormalizedSeerrTargetRequest {
	const title = normalizeResourceText(input.title ?? "");
	const metadata = normalizeResolverMetadata(input.metadata, false);
	return {
		source: input.source,
		mediaType: input.mediaType,
		...(title === undefined ? {} : { title }),
		...(metadata === undefined ? {} : { metadata }),
	};
}

export const normalizeSeerrMediaStatusRequest = (
	input: GetSeerrMediaStatusInput,
): NormalizedSeerrMediaStatusRequest => {
	if (input.mediaType === "movie") {
		return { mediaType: "movie", tmdbId: input.tmdbId };
	}
	if (input.seasons === undefined || input.seasons === "all") {
		return { mediaType: "tv", tmdbId: input.tmdbId };
	}
	return {
		mediaType: "tv",
		tmdbId: input.tmdbId,
		seasons: normalizeSeasonNumbers(input.seasons),
	};
};

export const normalizeMappingInspectionRequest = (
	provider: Provider,
	source: SourceIdentity,
): NormalizedMappingInspectionRequest => ({
	provider,
	source,
});

export const normalizeProviderLookupRequest = (input: {
	term: string;
}): NormalizedProviderLookupRequest => ({
	term: normalizeResourceText(input.term) ?? "",
});

export const normalizeSeerrSearchRequest = (
	input: SearchSeerrMediaInput,
): NormalizedSeerrSearchRequest => ({
	query: normalizeResourceText(input.query) ?? "",
});

export const normalizeMetadataIds = (
	ids: readonly AniListId[],
): AniListId[] => {
	return [...new Set(ids.filter(isAniListId))].toSorted((a, b) => a - b);
};

const mappingInspectionItemKey = (provider: Provider, source: SourceIdentity) =>
	[
		...mappingRootKey(),
		"inspection",
		provider,
		sourceIdentityKey(source),
	] as const;

const providerMediaStatusItemKey = (
	provider: Provider,
	source: SourceIdentity,
) =>
	[
		...rootQueryKey,
		"provider",
		provider,
		"mediaStatus",
		sourceIdentityKey(source),
	] as const;

const seerrMediaStatusItemKey = (mediaType: SeerrMediaType, tmdbId: TmdbId) =>
	[...rootQueryKey, "seerr", "mediaStatus", mediaType, tmdbId] as const;

export const queryKeys = {
	all: rootQueryKey,
	options: () => [...rootQueryKey, "options", "extension"] as const,
	publicOptions: () => [...rootQueryKey, "options", "public"] as const,
	aniListMedia: (anilistId: AniListId) =>
		[...rootQueryKey, "anilist", "media", anilistId] as const,
	aniListMediaPlaceholder: () =>
		[...rootQueryKey, "anilist", "media", 0] as const,
	aniListMetadata: (ids: readonly AniListId[]) =>
		[
			...rootQueryKey,
			"anilist",
			"metadata",
			normalizeMetadataIds(ids),
		] as const,
	myAnimeListMetadata: (malId: MyAnimeListId | 0) =>
		[...rootQueryKey, "myanimelist", "metadata", malId] as const,
	mappingRoot: mappingRootKey,
	mappings: () => [...mappingRootKey(), "list"] as const,
	mappingIdentitiesRoot: () => [...mappingRootKey(), "identities"] as const,
	mappingIdentities: (ids: readonly AniListId[]) =>
		[...mappingRootKey(), "identities", normalizeMetadataIds(ids)] as const,
	sourceAniListIds: (sources: readonly SourceIdentity[]) =>
		[
			...mappingRootKey(),
			"sourceAniListIds",
			[
				...new Set(sources.map((source) => sourceIdentityKey(source))),
			].toSorted(),
		] as const,
	mappingInspectionRoot: () => [...mappingRootKey(), "inspection"] as const,
	mappingInspectionItem: mappingInspectionItemKey,
	mappingInspection: (input: NormalizedMappingInspectionRequest) =>
		[...mappingInspectionItemKey(input.provider, input.source), input] as const,
	providerRoot: (provider: Provider) =>
		[...rootQueryKey, "provider", provider] as const,
	providerConnection: (provider: Provider, scope = configuredScope) =>
		[...rootQueryKey, "provider", provider, "connection", scope] as const,
	seerrRoot: () => [...rootQueryKey, "seerr"] as const,
	seerrConnection: (scope = configuredScope) =>
		[...rootQueryKey, "seerr", "connection", scope] as const,
	seerrTargetsRoot: seerrTargetsRootKey,
	seerrTarget: (input: NormalizedSeerrTargetRequest) =>
		[...seerrTargetsRootKey(), "single", input] as const,
	seerrTargets: (items: GetSeerrTargetsInput) =>
		[
			...seerrTargetsRootKey(),
			"batch",
			items
				.map((item) => ({ ...item }))
				.toSorted(
					(left, right) =>
						left.anilistId - right.anilistId ||
						left.mediaType.localeCompare(right.mediaType),
				),
		] as const,
	seerrMediaStatusItem: seerrMediaStatusItemKey,
	seerrMediaStatus: (input: NormalizedSeerrMediaStatusRequest | null) =>
		input === null
			? ([...rootQueryKey, "seerr", "mediaStatus", null] as const)
			: ([
					...seerrMediaStatusItemKey(input.mediaType, input.tmdbId),
					input.mediaType === "tv" ? input.seasons : undefined,
				] as const),
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
	seerrPublicSettings: () =>
		[...rootQueryKey, "seerr", "publicSettings"] as const,
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
	seerrSearch: (input: NormalizedSeerrSearchRequest) =>
		[...rootQueryKey, "seerr", "search", input] as const,
	providerFormResources: (provider: Provider, scope = configuredScope) =>
		[...rootQueryKey, "provider", provider, "formResources", scope] as const,
	providerLookupRoot: (provider: Provider) =>
		[...rootQueryKey, "provider", provider, "lookup"] as const,
	providerLookup: (
		provider: Provider,
		input: NormalizedProviderLookupRequest,
	) => [...rootQueryKey, "provider", provider, "lookup", input] as const,
	providerMediaStatusRoot: (provider: Provider) =>
		[...rootQueryKey, "provider", provider, "mediaStatus"] as const,
	providerMediaStatusItem: providerMediaStatusItemKey,
	providerMediaStatus: (
		provider: Provider,
		input: NormalizedMediaStatusRequest,
	) => [...providerMediaStatusItemKey(provider, input.source), input] as const,
};
