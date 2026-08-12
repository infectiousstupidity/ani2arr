/** Provider selection shared by supported content surfaces. */

import type { AniListId } from "@/anilist/types";
import type { AnimeFormat } from "@/shared/types/anime-format";
import type { Provider } from "@/providers/types";
import type { MappingIdentity } from "@/rpc/types";

export type AnimeTargetRoute =
	| { provider: "sonarr"; seerrMediaType: "tv" }
	| { provider: "radarr"; seerrMediaType: "movie" };

function routeForProvider(provider: Provider): AnimeTargetRoute {
	return provider === "radarr"
		? { provider, seerrMediaType: "movie" }
		: { provider, seerrMediaType: "tv" };
}

export function resolveRouteForAnimeFormat(
	format: AnimeFormat | null | undefined,
): AnimeTargetRoute | null {
	switch (format) {
		case "MOVIE": {
			return routeForProvider("radarr");
		}
		case "TV":
		case "TV_SHORT":
		case "SPECIAL":
		case "OVA":
		case "ONA": {
			return routeForProvider("sonarr");
		}
		default: {
			return null;
		}
	}
}

export function resolveAnimeTargetRoute(input: {
	anilistId: AniListId;
	format: AnimeFormat | null;
	mappedIdentities: readonly MappingIdentity[];
}): AnimeTargetRoute | null {
	if (input.format === "MUSIC") return null;

	const routedProvider =
		resolveRouteForAnimeFormat(input.format)?.provider ?? null;
	const mappedIdentities = input.mappedIdentities.filter(
		(identity) =>
			identity.anilistId === input.anilistId &&
			identity.result.kind === "mapped",
	);
	const formatMatchedIdentity =
		routedProvider === null
			? null
			: (mappedIdentities.find(
					(identity) => identity.provider === routedProvider,
				) ?? null);
	const mappedIdentity = formatMatchedIdentity ?? mappedIdentities[0] ?? null;
	const provider = mappedIdentity?.provider ?? routedProvider;

	return provider === null ? null : routeForProvider(provider);
}
