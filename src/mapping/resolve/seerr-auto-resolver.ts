/** Resolves source-native Seerr targets through typed background dependencies. */

import type {
	AniListId,
	AniListMedia,
	AniListMediaHint,
} from "@/anilist/types";
import {
	captureAutomaticWriteToken,
	type AutomaticWriteToken,
	type SeerrAutoResult,
} from "@/mapping/auto.store";
import type { EffectiveSeerrTarget } from "@/mapping/mapping.service";
import { searchMediaFromHint } from "@/mapping/resolve/resolve";
import {
	findTitleMatchForTerm,
	getSearchTerms,
	type SearchMedia,
} from "@/mapping/resolve/title-matching";
import type { SeerrTarget } from "@/mapping/seerr-target";
import type { SourceIdentity } from "@/mapping/source-identity";
import type { MyAnimeListId } from "@/myanimelist/types";
import type { TmdbId } from "@/providers/schemas";
import type {
	SeerrMediaDetails,
	SeerrMediaType,
	SeerrSearchResult,
} from "@/providers/seerr/types";

export type SeerrAutoResolverInput = {
	source: SourceIdentity;
	mediaType: SeerrMediaType;
	anilistId?: AniListId;
	title?: string;
	metadata?: AniListMediaHint | null;
	forceRetry?: boolean;
};

type SeerrAutoResolverDependencies = {
	getEffectiveTarget(input: {
		identity: SourceIdentity;
		mediaType: SeerrMediaType;
		anilistId?: AniListId;
	}): Promise<EffectiveSeerrTarget | null>;
	getAutoResult(
		identity: SourceIdentity,
		mediaType: SeerrMediaType,
		anilistId?: AniListId,
	): Promise<SeerrAutoResult | null>;
	setAutoResult(
		token: AutomaticWriteToken,
		...args: [
			identity: SourceIdentity,
			mediaType: SeerrMediaType,
			result: SeerrAutoResult,
			anilistId?: AniListId,
		]
	): Promise<boolean>;
	loadAniListMedia(anilistId: AniListId): Promise<AniListMedia>;
	loadMyAnimeListMetadata(
		malId: MyAnimeListId,
	): Promise<AniListMediaHint | null>;
	searchMedia(query: string): Promise<SeerrSearchResult[]>;
	getTvDetails(tmdbId: TmdbId): Promise<SeerrMediaDetails>;
};

type SearchMatch = {
	result: SeerrSearchResult;
	matchedTitle: string;
};

function toEffectiveTarget(
	input: SeerrAutoResolverInput,
	target: SeerrTarget,
): EffectiveSeerrTarget {
	return {
		...(input.anilistId === undefined ? {} : { anilistId: input.anilistId }),
		source: "automatic",
		...target,
	};
}

async function searchForMatch(input: {
	media: SearchMedia;
	mediaType: SeerrMediaType;
	searchedTitleKeys: Set<string>;
	searchMedia(query: string): Promise<SeerrSearchResult[]>;
}): Promise<SearchMatch | null> {
	const profile = input.mediaType === "movie" ? "radarr" : "sonarr";
	const targetYear = input.media.startDate?.year ?? undefined;
	for (const term of getSearchTerms(profile, input.media)) {
		if (input.searchedTitleKeys.has(term.canonical)) continue;
		input.searchedTitleKeys.add(term.canonical);

		const searchResults = await input.searchMedia(term.display);
		const results = searchResults.filter(
			(result) => result.mediaType === input.mediaType,
		);
		const match = findTitleMatchForTerm(
			profile,
			term,
			targetYear,
			results.map((result) => ({
				providerId: result.tmdbId,
				title: result.title,
				...(result.alternateTitles === undefined
					? {}
					: { alternateTitles: result.alternateTitles }),
				...(result.year === undefined ? {} : { year: result.year }),
			})),
		);
		if (!match) continue;

		const result = results.find(
			(candidate) => candidate.tmdbId === match.providerId,
		);
		if (result) return { result, matchedTitle: match.matchedTitle };
	}

	return null;
}

function collectTitles(
	input: SeerrAutoResolverInput,
	enriched: SearchMedia | null,
): string[] {
	return [
		input.title,
		input.metadata?.titles?.english,
		input.metadata?.titles?.romaji,
		input.metadata?.titles?.native,
		...(input.metadata?.synonyms ?? []),
		enriched?.title.english,
		enriched?.title.romaji,
		enriched?.title.native,
		...(enriched?.synonyms ?? []),
	].filter((title): title is string => Boolean(title?.trim()));
}

function inferExplicitSeason(titles: readonly string[]): number | undefined {
	const seasons = new Set<number>();
	const patterns = [
		/(?:^|[^\p{L}\p{N}])season\s+([1-9]\d*)(?![\d.])/giu,
		/(?:^|[^\p{L}\p{N}])([1-9]\d*)(?:st|nd|rd|th)\s+season(?![\p{L}\p{N}])/giu,
		/(?:^|[^\p{L}\p{N}])s([1-9]\d*)(?![\p{L}\p{N}]|\.\d)/giu,
		/第\s*([1-9]\d*)\s*期/gu,
	] as const;

	for (const title of titles) {
		for (const pattern of patterns) {
			for (const match of title.matchAll(pattern)) {
				const season = Number(match[1]);
				if (Number.isSafeInteger(season)) seasons.add(season);
			}
		}
	}

	return seasons.size === 1 ? [...seasons][0] : undefined;
}

async function loadEnrichedMedia(
	input: SeerrAutoResolverInput,
	dependencies: SeerrAutoResolverDependencies,
): Promise<SearchMedia | null> {
	try {
		if (input.source.source === "mal") {
			return searchMediaFromHint({
				metadata: await dependencies.loadMyAnimeListMetadata(input.source.id),
			});
		}

		return await dependencies.loadAniListMedia(input.source.id);
	} catch {
		return null;
	}
}

async function buildMatchedTarget(input: {
	request: SeerrAutoResolverInput;
	match: SearchMatch;
	enrichedMedia: SearchMedia | null;
	dependencies: SeerrAutoResolverDependencies;
}): Promise<SeerrTarget> {
	if (input.match.result.mediaType === "movie") {
		return { mediaType: "movie", tmdbId: input.match.result.tmdbId };
	}

	const details = await input.dependencies.getTvDetails(
		input.match.result.tmdbId,
	);
	let enrichedMedia = input.enrichedMedia;
	let inferredSeason = inferExplicitSeason(
		collectTitles(input.request, enrichedMedia),
	);
	if (inferredSeason === undefined && enrichedMedia === null) {
		enrichedMedia = await loadEnrichedMedia(input.request, input.dependencies);
		inferredSeason = inferExplicitSeason(
			collectTitles(input.request, enrichedMedia),
		);
	}
	const hasInferredSeason = details.seasons?.some(
		(season) => season.seasonNumber === inferredSeason,
	);
	return {
		mediaType: "tv",
		tmdbId: input.match.result.tmdbId,
		...(details.tvdbId === undefined ? {} : { tvdbId: details.tvdbId }),
		...(inferredSeason !== undefined && hasInferredSeason
			? { seasons: [inferredSeason] }
			: {}),
	};
}

export function createSeerrAutoResolver(
	dependencies: SeerrAutoResolverDependencies,
): (input: SeerrAutoResolverInput) => Promise<EffectiveSeerrTarget | null> {
	return async (
		input: SeerrAutoResolverInput,
	): Promise<EffectiveSeerrTarget | null> => {
		const writeToken = captureAutomaticWriteToken();
		const identity = {
			identity: input.source,
			mediaType: input.mediaType,
			...(input.anilistId === undefined ? {} : { anilistId: input.anilistId }),
		};
		const effective = await dependencies.getEffectiveTarget(identity);
		if (
			effective &&
			(input.forceRetry !== true || effective.source !== "automatic")
		) {
			return effective;
		}

		const cached = await dependencies.getAutoResult(
			input.source,
			input.mediaType,
			input.anilistId,
		);
		if (cached?.kind === "mapped" && input.forceRetry !== true) {
			return toEffectiveTarget(input, cached.target);
		}
		if (
			cached?.kind === "unmapped" &&
			input.forceRetry !== true &&
			input.title === undefined &&
			input.metadata === undefined
		) {
			return null;
		}

		const searchedTitleKeys = new Set<string>();
		const hintMedia = searchMediaFromHint({
			...(input.title === undefined ? {} : { title: input.title }),
			...(input.metadata === undefined ? {} : { metadata: input.metadata }),
		});
		let match = hintMedia
			? await searchForMatch({
					media: hintMedia,
					mediaType: input.mediaType,
					searchedTitleKeys,
					searchMedia: dependencies.searchMedia,
				})
			: null;
		let enrichedMedia: SearchMedia | null = null;

		if (!match) {
			enrichedMedia = await loadEnrichedMedia(input, dependencies);
			if (enrichedMedia) {
				match = await searchForMatch({
					media: enrichedMedia,
					mediaType: input.mediaType,
					searchedTitleKeys,
					searchMedia: dependencies.searchMedia,
				});
			}
		}

		if (!match) {
			await dependencies.setAutoResult(
				writeToken,
				input.source,
				input.mediaType,
				{ kind: "unmapped" },
				input.anilistId,
			);
			return null;
		}

		const target = await buildMatchedTarget({
			request: input,
			match,
			enrichedMedia,
			dependencies,
		});

		const stored = await dependencies.setAutoResult(
			writeToken,
			input.source,
			input.mediaType,
			{
				kind: "mapped",
				target,
				matchedTitle: match.matchedTitle,
			},
			input.anilistId,
		);
		return stored ? toEffectiveTarget(input, target) : null;
	};
}
