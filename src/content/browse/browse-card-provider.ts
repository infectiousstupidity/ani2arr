/** Provider resolution helper for browse-card overlay targets. */
// src/content/browse/browse-card-provider.ts

import type { AniListMediaHint } from "@/anilist/types";
import {
	resolveAnimeTargetRoute,
	resolveRouteForAnimeFormat,
	type AnimeTargetRoute,
} from "@/content/target-provider";
import type { MappingIdentity } from "@/rpc/types";
import type { HostMediaTarget } from "./types";

export function resolveBrowseCardRoute(input: {
	parsed: HostMediaTarget;
	metadata: AniListMediaHint | null;
	mappedIdentities: readonly MappingIdentity[];
}): AnimeTargetRoute | null {
	if (input.parsed.anilistId === undefined) {
		return resolveRouteForAnimeFormat(
			input.parsed.format ?? input.metadata?.format ?? null,
		);
	}

	return resolveAnimeTargetRoute({
		anilistId: input.parsed.anilistId,
		format: input.parsed.format ?? input.metadata?.format ?? null,
		mappedIdentities: input.mappedIdentities,
	});
}
