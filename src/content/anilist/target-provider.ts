/** AniList target provider selection shared by browse and anime-page content surfaces. */
// src/content/anilist/target-provider.ts

import type { AniListId, AniListMediaFormat } from "@/anilist/types";
import type { MappingIdentity } from "@/rpc/types";
import { resolveProviderForAniListFormat } from "@/providers/provider-routing";
import type { Provider } from "@/providers/types";

export function getMappedIdentitiesByAniListId(
	identities: readonly MappingIdentity[],
): Map<AniListId, MappingIdentity[]> {
	const identitiesById = new Map<AniListId, MappingIdentity[]>();
	for (const identity of identities) {
		if (identity.result.kind !== "mapped") {
			continue;
		}

		const existing = identitiesById.get(identity.anilistId);
		if (existing) {
			existing.push(identity);
			continue;
		}

		identitiesById.set(identity.anilistId, [identity]);
	}

	return identitiesById;
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
