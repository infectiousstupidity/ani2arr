/** Resolves source-native Seerr targets through typed background dependencies. */

import type {
	AniListId,
	AniListMedia,
	AniListMediaFormat,
	AniListMediaHint,
} from "@/anilist/types";
import { searchMediaFromHint } from "@/mapping/resolve/resolve";
import {
	findTitleMatchForTerm,
	getSearchTerms,
	type SearchMedia,
} from "@/mapping/resolve/title-matching";
import type { SeerrAutoResult } from "@/mapping/seerr-auto.store";
import type { SeerrTarget } from "@/mapping/seerr-target";
import type { EffectiveSeerrTarget } from "@/mapping/seerr-target.store";
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
	anilistId?: AniListId;
	title?: string;
	metadata?: AniListMediaHint | null;
	forceRetry?: boolean;
};

type SeerrAutoResolverDependencies = {
	getEffectiveTarget(input: {
		identity: SourceIdentity;
		anilistId?: AniListId;
	}): Promise<EffectiveSeerrTarget | null>;
	getAutoResult(
		identity: SourceIdentity,
		anilistId?: AniListId,
	): Promise<SeerrAutoResult | null>;
	setAutoResult(
		identity: SourceIdentity,
		result: SeerrAutoResult,
		anilistId?: AniListId,
	): Promise<void>;
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

function getExpectedMediaType(
	format: AniListMediaFormat | null | undefined,
): SeerrMediaType | null {
	switch (format) {
		case "MOVIE": {
			return "movie";
		}
		case "TV":
		case "TV_SHORT":
		case "SPECIAL":
		case "OVA":
		case "ONA":
		case "MUSIC": {
			return "tv";
		}
		default: {
			return null;
		}
	}
}

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
	searchedTitleKeys: Set<string>;
	searchMedia(query: string): Promise<SeerrSearchResult[]>;
}): Promise<SearchMatch | null> {
	const expectedMediaType = getExpectedMediaType(input.media.format);
	if (expectedMediaType === null) return null;

	const profile = expectedMediaType === "movie" ? "radarr" : "sonarr";
	const targetYear = input.media.startDate?.year ?? undefined;
	for (const term of getSearchTerms(profile, input.media)) {
		if (input.searchedTitleKeys.has(term.canonical)) continue;
		input.searchedTitleKeys.add(term.canonical);

		const searchResults = await input.searchMedia(term.display);
		const results = searchResults.filter(
			(result) => result.mediaType === expectedMediaType,
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
		const identity = {
			identity: input.source,
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
					searchedTitleKeys,
					searchMedia: dependencies.searchMedia,
				});
			}
		}

		if (!match) {
			await dependencies.setAutoResult(
				input.source,
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

		await dependencies.setAutoResult(
			input.source,
			{
				kind: "mapped",
				target,
				matchedTitle: match.matchedTitle,
			},
			input.anilistId,
		);
		return toEffectiveTarget(input, target);
	};
}
