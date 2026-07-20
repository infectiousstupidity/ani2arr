/** Runs automatic mapping resolution and stores its result. */
// src/mapping/resolve/resolve.ts

import type { AniListMediaService } from "@/anilist/media.service";
import type {
	AniListId,
	AniListMedia,
	AniListMediaHint,
} from "@/anilist/types";
import type { SourceIdentity } from "@/mapping/source-identity";
import type { Provider } from "@/providers/types";
import { setAutoResult } from "../auto.store";
import { getUniqueAniListIdForSource } from "../upstream.store";
import {
	searchCandidate,
	type ProviderCandidateSearch,
} from "./candidate-search";
import { searchPrequelChain } from "./prequel-chain";
import type { SearchMedia } from "./title-matching";

export type AutomaticResolver = (
	provider: Provider,
	source: SourceIdentity,
	rejectedProviderIds: number[],
	options?: { title?: string; metadata?: AniListMediaHint | null },
) => Promise<void>;

function mediaFromStatusHint(input: {
	title?: string;
	metadata?: AniListMediaHint | null;
}): SearchMedia | null {
	const title = input.title?.trim();
	const metadataTitles = input.metadata?.titles ?? {};
	const titles = title ? { romaji: title } : metadataTitles;
	if (!titles.english && !titles.romaji && !titles.native) return null;

	const startYear = input.metadata?.startYear ?? null;
	const synonyms = input.metadata?.synonyms ?? [];

	return {
		title: titles,
		...(typeof startYear === "number" ? { startDate: { year: startYear } } : {}),
		synonyms,
	};
}

export function createAutomaticResolver(dependencies: {
	anilistMedia: AniListMediaService;
	searchProviderCandidates: ProviderCandidateSearch;
	getUniqueAniListIdForSource?: (source: SourceIdentity) => Promise<AniListId | null>;
}): AutomaticResolver {
	return async function resolveAutomaticMapping(
		provider,
		source,
		rejectedProviderIds,
		options,
	): Promise<void> {
		const findUniqueAniListId =
			dependencies.getUniqueAniListIdForSource ?? getUniqueAniListIdForSource;
		const searchedTitleKeys = new Set<string>();
		const search = (candidateMedia: SearchMedia) =>
			searchCandidate({
				provider,
				media: candidateMedia,
				searchProviderCandidates: dependencies.searchProviderCandidates,
				rejectedProviderIds,
				searchedTitleKeys,
			});

		const hintMedia = mediaFromStatusHint({
			...(options?.title === undefined ? {} : { title: options.title }),
			...(options?.metadata === undefined ? {} : { metadata: options.metadata }),
		});
		const hintMatch = hintMedia ? await search(hintMedia) : null;
		if (hintMatch) {
			await setAutoResult(provider, source, {
				kind: "mapped",
				providerId: hintMatch.providerId,
				matchedTitle: hintMatch.matchedTitle,
			});
			return;
		}

		const anilistId = await findUniqueAniListId(source);
		if (anilistId === null) {
			await setAutoResult(provider, source, { kind: "unmapped" });
			return;
		}

		let media: AniListMedia;
		try {
			media = await dependencies.anilistMedia.fetchMediaWithRelations(
				anilistId,
			);
		} catch {
			return;
		}

		const match =
			(await search(media)) ??
			(await searchPrequelChain(dependencies.anilistMedia, media, search));

		if (!match) {
			await setAutoResult(provider, source, {
				kind: "unmapped",
			});
			return;
		}

		await setAutoResult(provider, source, {
			kind: "mapped",
			providerId: match.providerId,
			matchedTitle: match.matchedTitle,
		});
	};
}
