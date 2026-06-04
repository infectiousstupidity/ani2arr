/** Applies automatic mapping search to AniList prequel relations. */
// src/mapping/resolve/prequel-chain.ts

import type { AniListMediaService } from "@/anilist/media.service";
import type { AniListMedia } from "@/anilist/types";
import type { TitleMatch } from "./title-matching";

export async function searchPrequelChain(
	anilistMedia: AniListMediaService,
	media: AniListMedia,
	search: (prequel: AniListMedia) => Promise<TitleMatch | null>,
): Promise<TitleMatch | null> {
	for await (const prequel of anilistMedia.iteratePrequelChain(media)) {
		const match = await search(prequel);

		if (match) {
			return match;
		}
	}

	return null;
}
