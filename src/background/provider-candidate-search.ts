/** Fetches automatic mapping candidates through background-owned provider I/O. */
// src/background/provider-candidate-search.ts

import type { TitleCandidate } from "@/mapping/resolve/title-matching";
import type { RadarrClient } from "@/providers/radarr/client";
import type { RadarrLookupMovie } from "@/providers/radarr/types";
import type { SonarrClient } from "@/providers/sonarr/client";
import type { SonarrLookupSeries } from "@/providers/sonarr/types";
import type { Provider, ProviderCredentials } from "@/providers/types";

type ProviderCandidateDependencies = {
	getCredentials: (provider: Provider) => Promise<ProviderCredentials>;
	sonarr: SonarrClient;
	radarr: RadarrClient;
};

export async function fetchProviderCandidates(
	provider: Provider,
	title: string,
	dependencies: ProviderCandidateDependencies,
): Promise<TitleCandidate[]> {
	const credentials = await dependencies.getCredentials(provider);
	let candidates: TitleCandidate[];
	if (provider === "sonarr") {
		const results = await dependencies.sonarr.lookupSeries(title, credentials);
		candidates = results.map((result) => fromSonarrResult(result));
	} else {
		const results = await dependencies.radarr.lookupMovies(title, credentials);
		candidates = results.map((result) => fromRadarrResult(result));
	}

	return deduplicateCandidates(candidates);
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
		...(result.folderName === undefined
			? {}
			: { folderName: result.folderName }),
		...(alternateTitles.length > 0 ? { alternateTitles } : {}),
		...(result.year === undefined ? {} : { year: result.year }),
	};
}

function deduplicateCandidates(candidates: TitleCandidate[]): TitleCandidate[] {
	const seenProviderIds = new Set<number>();
	return candidates.filter((candidate) => {
		if (seenProviderIds.has(candidate.providerId)) return false;
		seenProviderIds.add(candidate.providerId);
		return true;
	});
}
