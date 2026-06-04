/** Searches Sonarr or Radarr for automatic mapping candidates. */
// src/mapping/resolve/candidate-search.ts

import type { AniListMedia } from "@/anilist/types";
import type {
	Provider,
	ProviderCredentials,
} from "@/providers/types";
import type { RadarrClient } from "@/providers/radarr/client";
import type { RadarrLookupMovie } from "@/providers/radarr/types";
import type { SonarrClient } from "@/providers/sonarr/client";
import type { SonarrLookupSeries } from "@/providers/sonarr/types";
import {
	findTitleMatchForTerm,
	getSearchTerms,
	type TitleCandidate,
	type TitleMatch,
} from "./title-matching";

type SearchCandidateOptions = {
	provider: Provider;
	media: AniListMedia;
	credentials: ProviderCredentials;
	clients: {
		sonarr: SonarrClient;
		radarr: RadarrClient;
	};
	rejectedProviderIds: number[];
	searchedTitleKeys?: Set<string>;
};

export async function searchCandidate({
	provider,
	media,
	credentials,
	clients,
	rejectedProviderIds,
	searchedTitleKeys,
}: SearchCandidateOptions): Promise<TitleMatch | null> {
	const search = provider === "sonarr"
		? (title: string) => searchSonarr(title, credentials, clients.sonarr)
		: (title: string) => searchRadarr(title, credentials, clients.radarr);
	const targetYear = media.startDate?.year ?? undefined;

	for (const term of getSearchTerms(provider, media)) {
		if (searchedTitleKeys?.has(term.canonical)) {
			continue;
		}

		searchedTitleKeys?.add(term.canonical);
		const searchResults = await search(term.display);
		const candidates = searchResults.filter(
			(candidate) => !rejectedProviderIds.includes(candidate.providerId),
		);
		const match = findTitleMatchForTerm(provider, term, targetYear, candidates);
		if (match) {
			return match;
		}
	}

	return null;
}

async function searchSonarr(
	title: string,
	credentials: ProviderCredentials,
	client: SonarrClient,
): Promise<TitleCandidate[]> {
	const candidates: TitleCandidate[] = [];
	const results = await client.lookupSeries(title, credentials);
	for (const result of results) {
		addCandidate(candidates, fromSonarrResult(result));
	}

	return candidates;
}

async function searchRadarr(
	title: string,
	credentials: ProviderCredentials,
	client: RadarrClient,
): Promise<TitleCandidate[]> {
	const candidates: TitleCandidate[] = [];
	const results = await client.lookupMovies(title, credentials);
	for (const result of results) {
		addCandidate(candidates, fromRadarrResult(result));
	}

	return candidates;
}

function fromSonarrResult(result: SonarrLookupSeries): TitleCandidate {
	const alternateTitles = (result.alternateTitles ?? [])
		.map((alternateTitle) => alternateTitle.title?.trim())
		.filter(
			(title): title is string => typeof title === "string" && title.length > 0,
		);

	return {
		providerId: result.tvdbId,
		title: result.title,
		...(result.sortTitle === undefined ? {} : { sortTitle: result.sortTitle }),
		...(result.titleSlug === undefined ? {} : { titleSlug: result.titleSlug }),
		...(alternateTitles.length > 0 ? { alternateTitles } : {}),
		...(result.year === undefined ? {} : { year: result.year }),
		...(result.genres === undefined ? {} : { genres: result.genres }),
	};
}

function fromRadarrResult(result: RadarrLookupMovie): TitleCandidate {
	const alternateTitles = [
		result.originalTitle,
		...(result.alternateTitles ?? []).map(
			(alternateTitle) => alternateTitle.title,
		),
	]
		.map((title) => title?.trim())
		.filter(
			(title): title is string => typeof title === "string" && title.length > 0,
		);

	return {
		providerId: result.tmdbId,
		title: result.title,
		...(result.originalTitle === undefined
			? {}
			: { originalTitle: result.originalTitle }),
		...(result.titleSlug === undefined ? {} : { titleSlug: result.titleSlug }),
		...(result.folderName === undefined ? {} : { folderName: result.folderName }),
		...(alternateTitles.length > 0 ? { alternateTitles } : {}),
		...(result.year === undefined ? {} : { year: result.year }),
	};
}

function addCandidate(
	candidates: TitleCandidate[],
	candidate: TitleCandidate,
): void {
	if (
		candidates.some((existing) => existing.providerId === candidate.providerId)
	) {
		return;
	}

	candidates.push(candidate);
}
