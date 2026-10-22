/** Provider selection shared by supported content surfaces. */

import type { AniListId, AniListMediaFormat } from "@/anilist/types";
import type { Provider } from "@/providers/types";
import type { MappingIdentity } from "@/rpc/types";

export function resolveProviderForAniListFormat(
	format: AniListMediaFormat | null | undefined,
): Provider | null {
	switch (format) {
		case "MOVIE": {
			return "radarr";
		}
		case "TV":
		case "TV_SHORT":
		case "SPECIAL":
		case "OVA":
		case "ONA": {
			return "sonarr";
		}
		default: {
			return null;
		}
	}
}

export function resolveAniListTargetProvider(input: {
	anilistId: AniListId;
	format: AniListMediaFormat | null;
	mappedIdentities: readonly MappingIdentity[];
}): Provider | null {
	const routedProvider = resolveProviderForAniListFormat(input.format);
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

	return mappedIdentity?.provider ?? routedProvider;
}
