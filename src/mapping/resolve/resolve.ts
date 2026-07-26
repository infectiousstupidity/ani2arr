/** Runs automatic mapping resolution and stores its result. */
// src/mapping/resolve/resolve.ts

import type { AniListMediaService } from "@/anilist/media.service";
import {
	parseAniListIdOrNull,
	type AniListId,
	type AniListMedia,
	type AniListMediaHint,
} from "@/anilist/types";
import type { MyAnimeListId } from "@/myanimelist/types";
import type { Provider } from "@/providers/types";
import { setAutoResult } from "../auto.store";
import type { SourceIdentity } from "../source-identity";
import {
	searchCandidate,
	type ProviderCandidateSearch,
} from "./candidate-search";
import { searchPrequelChain } from "./prequel-chain";
import type { SearchMedia, TitleMatch } from "./title-matching";

export type AutomaticResolver = (request: {
	provider: Provider;
	identity: SourceIdentity;
	anilistId: AniListId | null;
	rejectedProviderIds: number[];
	title?: string;
	metadata?: AniListMediaHint | null;
}) => Promise<boolean>;

function searchMediaFromHint(input: {
	title?: string;
	metadata?: AniListMediaHint | null;
}): SearchMedia | null {
	const title = input.title?.trim();
	const metadataTitles = input.metadata?.titles ?? {};
	const titles = {
		...metadataTitles,
		...(!metadataTitles.romaji && title ? { romaji: title } : {}),
	};
	const startYear = input.metadata?.startYear ?? null;
	const synonyms = [...(input.metadata?.synonyms ?? [])];
	if (title && !Object.values(metadataTitles).includes(title)) {
		synonyms.unshift(title);
	}
	if (
		!titles.english &&
		!titles.romaji &&
		!titles.native &&
		synonyms.length === 0
	) {
		return null;
	}

	return {
		title: titles,
		...(typeof startYear === "number"
			? { startDate: { year: startYear } }
			: {}),
		synonyms,
	};
}

async function searchInitialMetadata(input: {
	hintMedia: SearchMedia | null;
	identity: SourceIdentity;
	loadMyAnimeListMetadata: (
		malId: MyAnimeListId,
	) => Promise<AniListMediaHint | null>;
	search: (media: SearchMedia) => Promise<TitleMatch | null>;
}): Promise<TitleMatch | null> {
	const hintMatch = input.hintMedia
		? await input.search(input.hintMedia)
		: null;
	if (hintMatch || input.identity.source !== "mal") return hintMatch;

	try {
		const metadata = await input.loadMyAnimeListMetadata(input.identity.id);
		const media = searchMediaFromHint({ metadata });
		return media ? input.search(media) : null;
	} catch {
		// DOM metadata remains usable, and a linked AniList fallback may still work.
		return null;
	}
}

export function createAutomaticResolver(dependencies: {
	anilistMedia: AniListMediaService;
	loadMyAnimeListMetadata: (
		malId: MyAnimeListId,
	) => Promise<AniListMediaHint | null>;
	searchProviderCandidates: ProviderCandidateSearch;
}): AutomaticResolver {
	return async function resolveAutomaticMapping(request): Promise<boolean> {
		const { provider, identity, anilistId, rejectedProviderIds } = request;
		const searchedTitleKeys = new Set<string>();
		const search = (candidateMedia: SearchMedia) =>
			searchCandidate({
				provider,
				media: candidateMedia,
				searchProviderCandidates: dependencies.searchProviderCandidates,
				rejectedProviderIds,
				searchedTitleKeys,
			});

		const hintMedia = searchMediaFromHint({
			...(request.title === undefined ? {} : { title: request.title }),
			...(request.metadata === undefined ? {} : { metadata: request.metadata }),
		});
		let match = await searchInitialMetadata({
			hintMedia,
			identity,
			loadMyAnimeListMetadata: dependencies.loadMyAnimeListMetadata,
			search,
		});
		let canonicalMedia: AniListMedia | null = null;

		if (!match && anilistId !== null) {
			try {
				canonicalMedia =
					await dependencies.anilistMedia.fetchMediaWithRelations(anilistId);
			} catch {
				return false;
			}
			match = await search(canonicalMedia);
		}

		if (!match && canonicalMedia?.relations !== undefined) {
			match = await searchPrequelChain(
				dependencies.anilistMedia,
				canonicalMedia,
				search,
			);
		}

		if (!match && canonicalMedia?.relations === undefined) {
			const prequelIds = new Set(
				(request.metadata?.relationPrequelIds ?? [])
					.map((id) => parseAniListIdOrNull(id))
					.filter((id): id is AniListId => id !== null),
			);
			for (const prequelId of prequelIds) {
				let prequel: AniListMedia;
				try {
					prequel =
						await dependencies.anilistMedia.fetchMediaWithRelations(prequelId);
				} catch {
					return false;
				}

				match =
					(await search(prequel)) ??
					(await searchPrequelChain(
						dependencies.anilistMedia,
						prequel,
						search,
					));
				if (match) break;
			}
		}

		await setAutoResult(
			provider,
			identity,
			match
				? {
						kind: "mapped",
						providerId: match.providerId,
						matchedTitle: match.matchedTitle,
					}
				: { kind: "unmapped" },
		);
		return true;
	};
}
