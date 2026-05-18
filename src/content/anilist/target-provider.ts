/** AniList target provider selection shared by browse and anime-page content surfaces. */
// src/content/anilist/target-provider.ts

import type { AniListId } from "@/anilist/anilist-id";
import type { AniListMediaFormat } from "@/anilist/schemas/media.schema";
import type { EffectiveMappingPresence } from "@/mapping/queries/mapping-identities";
import { resolveProviderForAniListFormat } from "@/providers/provider-routing";
import type { Provider } from "@/providers/types";

export function getMappedIdentitiesByAniListId(
	identities: readonly EffectiveMappingPresence[],
): Map<AniListId, EffectiveMappingPresence[]> {
	const identitiesById = new Map<AniListId, EffectiveMappingPresence[]>();
	for (const identity of identities) {
		if (
			identity.providerMappingState !== "mapped" ||
			identity.providerId === null
		) {
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
	mappedIdentities: readonly EffectiveMappingPresence[];
}): Provider | null {
	const routedProvider = resolveProviderForAniListFormat(input.format);
	const mappedIdentities = input.mappedIdentities.filter(
		(identity) =>
			identity.anilistId === input.anilistId &&
			identity.providerMappingState === "mapped" &&
			identity.providerId !== null,
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
