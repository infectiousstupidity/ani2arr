/** Shared React Query cache keys and pure input normalizers. */
// src/queries/query-keys.ts

import {
	type AniListId,
	type AniListMediaHint,
	isAniListId,
} from "@/anilist/types";
import { normalizeSeasonNumbers } from "@/mapping/season-numbers";
import {
	type SourceIdentity,
	sourceIdentityKey,
} from "@/mapping/source-identity";
import type { MyAnimeListId } from "@/myanimelist/types";
import type { TmdbId } from "@/providers/schemas";
import type { SeerrMediaType, SeerrTvSeasons } from "@/providers/seerr/types";
import type { Provider } from "@/providers/types";
import { type SourceInputLike, sourceFromInput } from "@/rpc/source-input";
import type { GetSeerrTargetInput, StatusInput } from "@/rpc/types";

const rootQueryKey = ["a2a"] as const;
const configuredScope = "configured";
const mappingRootKey = () => [...rootQueryKey, "mapping"] as const;
const seerrTargetsRootKey = () =>
	[...rootQueryKey, "seerr", "targets"] as const;

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

export type NormalizedSeerrTargetInput = {
	source: SourceIdentity;
	anilistId?: AniListId;
	title: string | null;
	metadata: AniListMediaHint | null;
	forceRetry: boolean;
};

const normalizeText = (value: string): string => value.trim().toLowerCase();

export const normalizeMetadataIds = (
	ids: readonly AniListId[],
): AniListId[] => {
	return [...new Set(ids.filter(isAniListId))].toSorted((a, b) => a - b);
};

export const normalizeSourceKey = (source: SourceIdentity): string =>
	sourceIdentityKey(source);

export const normalizeSourceKeys = (
	sources: readonly SourceIdentity[],
): string[] => {
	return [
		...new Set(sources.map((source) => sourceIdentityKey(source))),
	].toSorted();
};

export function normalizeSeerrTargetInput(
	input: GetSeerrTargetInput | AniListId,
): NormalizedSeerrTargetInput {
	const sourceInput = typeof input === "number" ? { anilistId: input } : input;
	const title = sourceInput.title?.trim() || null;
	return {
		source: sourceFromInput(sourceInput),
		...(sourceInput.anilistId === undefined
			? {}
			: { anilistId: sourceInput.anilistId }),
		title,
		metadata: sourceInput.metadata ?? null,
		forceRetry: sourceInput.forceRetry === true,
	};
}

const sourceKeyFromInput = (input: SourceKeyInput): string => {
	if (typeof input === "number") {
		return normalizeSourceKey({ source: "anilist", id: input });
	}
	if ("id" in input && "source" in input && typeof input.source === "string") {
		return normalizeSourceKey(input);
	}
	return normalizeSourceKey(sourceFromInput(input));
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
	sourceAniListIds: (sourceKeys: readonly string[]) =>
		[
			...mappingRootKey(),
			"sourceAniListIds",
			[...new Set(sourceKeys)].toSorted(),
		] as const,
	mappingInspectionRoot: () => [...mappingRootKey(), "inspection"] as const,
	mappingInspection: (provider: Provider, input: SourceKeyInput) =>
		[
			...mappingRootKey(),
			"inspection",
			provider,
			sourceKeyFromInput(input),
		] as const,
	providerRoot: (provider: Provider) =>
		[...rootQueryKey, "provider", provider] as const,
	providerConnection: (provider: Provider, scope = configuredScope) =>
		[...rootQueryKey, "provider", provider, "connection", scope] as const,
	seerrRoot: () => [...rootQueryKey, "seerr"] as const,
	seerrConnection: (scope = configuredScope) =>
		[...rootQueryKey, "seerr", "connection", scope] as const,
	seerrTargetsRoot: seerrTargetsRootKey,
	seerrTarget: (input: NormalizedSeerrTargetInput) =>
		[...seerrTargetsRootKey(), "single", input] as const,
	seerrTargets: (ids: readonly AniListId[]) =>
		[...seerrTargetsRootKey(), "batch", normalizeMetadataIds(ids)] as const,
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
							: {
									seasons: Array.isArray(input.seasons)
										? normalizeSeasonNumbers(input.seasons)
										: input.seasons,
								}),
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
	seerrSearch: (query: string) =>
		[...rootQueryKey, "seerr", "search", normalizeText(query)] as const,
	providerFormResources: (provider: Provider, scope = configuredScope) =>
		[...rootQueryKey, "provider", provider, "formResources", scope] as const,
	providerLookupRoot: (provider: Provider) =>
		[...rootQueryKey, "provider", provider, "lookup"] as const,
	providerLookup: (provider: Provider, term: string) =>
		[
			...rootQueryKey,
			"provider",
			provider,
			"lookup",
			normalizeText(term),
		] as const,
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
