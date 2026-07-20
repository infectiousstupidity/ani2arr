/** Applies automatic mapping policy to background-fetched title candidates. */
// src/mapping/resolve/candidate-search.ts

import type { Provider } from "@/providers/types";
import {
	findTitleMatchForTerm,
	getSearchTerms,
	type SearchMedia,
	type TitleCandidate,
	type TitleMatch,
} from "./title-matching";

export type ProviderCandidateSearch = (
	provider: Provider,
	title: string,
) => Promise<TitleCandidate[]>;

type SearchCandidateOptions = {
	provider: Provider;
	media: SearchMedia;
	searchProviderCandidates: ProviderCandidateSearch;
	rejectedProviderIds: number[];
	searchedTitleKeys?: Set<string>;
};

export async function searchCandidate({
	provider,
	media,
	searchProviderCandidates,
	rejectedProviderIds,
	searchedTitleKeys,
}: SearchCandidateOptions): Promise<TitleMatch | null> {
	const targetYear = media.startDate?.year ?? undefined;

	for (const term of getSearchTerms(provider, media)) {
		if (searchedTitleKeys?.has(term.canonical)) {
			continue;
		}

		searchedTitleKeys?.add(term.canonical);
		const searchResults = await searchProviderCandidates(
			provider,
			term.display,
		);
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
