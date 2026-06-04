/** Runs automatic mapping resolution and stores its result. */
// src/mapping/resolve/resolve.ts

import type { AniListMediaService } from "@/anilist/media.service";
import type {
	AniListId,
	AniListMedia,
	AniListMediaHint,
} from "@/anilist/types";
import type {
	Provider,
	ProviderCredentials,
} from "@/providers/types";
import type { RadarrClient } from "@/providers/radarr/client";
import type { SonarrClient } from "@/providers/sonarr/client";
import { setAutoResult } from "../auto.store";
import { searchCandidate } from "./candidate-search";
import { searchPrequelChain } from "./prequel-chain";

export type AutomaticResolver = (
	provider: Provider,
	anilistId: AniListId,
	rejectedProviderIds: number[],
	options?: { title?: string; metadata?: AniListMediaHint | null },
) => Promise<void>;

function mediaFromStatusHint(input: {
	anilistId: AniListId;
	title?: string;
	metadata?: AniListMediaHint | null;
}): AniListMedia | null {
	const title = input.title?.trim();
	const metadataTitles = input.metadata?.titles ?? {};
	const titles = title ? { romaji: title } : metadataTitles;
	if (!titles.english && !titles.romaji && !titles.native) return null;

	const startYear = input.metadata?.startYear ?? null;
	const synonyms = input.metadata?.synonyms ?? [];

	return {
		id: input.anilistId,
		format: input.metadata?.format ?? null,
		title: titles,
		...(typeof startYear === "number" ? { startDate: { year: startYear } } : {}),
		synonyms,
	};
}

export function createAutomaticResolver(dependencies: {
	anilistMedia: AniListMediaService;
	sonarr: SonarrClient;
	radarr: RadarrClient;
	getCredentials: (provider: Provider) => Promise<ProviderCredentials>;
}): AutomaticResolver {
	return async function resolveAutomaticMapping(
		provider,
		anilistId,
		rejectedProviderIds,
		options,
	): Promise<void> {
		const credentials = await dependencies.getCredentials(provider);
		const searchedTitleKeys = new Set<string>();
		const search = (candidateMedia: AniListMedia) =>
			searchCandidate({
				provider,
				media: candidateMedia,
				credentials,
				clients: {
					sonarr: dependencies.sonarr,
					radarr: dependencies.radarr,
				},
				rejectedProviderIds,
				searchedTitleKeys,
			});

		const hintMedia = mediaFromStatusHint({
			anilistId,
			...(options?.title === undefined ? {} : { title: options.title }),
			...(options?.metadata === undefined ? {} : { metadata: options.metadata }),
		});
		const hintMatch = hintMedia ? await search(hintMedia) : null;
		if (hintMatch) {
			await setAutoResult(provider, anilistId, {
				kind: "mapped",
				providerId: hintMatch.providerId,
				matchedTitle: hintMatch.matchedTitle,
			});
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
			await setAutoResult(provider, anilistId, {
				kind: "unmapped",
			});
			return;
		}

		await setAutoResult(provider, anilistId, {
			kind: "mapped",
			providerId: match.providerId,
			matchedTitle: match.matchedTitle,
		});
	};
}
