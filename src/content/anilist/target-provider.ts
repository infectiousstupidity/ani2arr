/** AniList target provider selection shared by browse and anime-page content surfaces. */
// src/content/anilist/target-provider.ts

import type { AniListId, AniListMediaFormat } from "@/anilist/types";
import { parseTmdbIdOrNull } from "@/providers/schemas";
import { resolveProviderForAniListFormat } from "@/providers/provider-routing";
import type { Provider } from "@/providers/types";
import type {
	MappingIdentity,
	RequestInSeerrInput,
	SeerrRequestTarget,
} from "@/rpc/types";

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

function getMappedRadarrSeerrRequestInput(input: {
	anilistId: AniListId;
	mappedIdentities: readonly MappingIdentity[];
}): RequestInSeerrInput | null {
	for (const identity of input.mappedIdentities) {
		if (
			identity.anilistId !== input.anilistId ||
			identity.provider !== "radarr" ||
			identity.result.kind !== "mapped"
		) {
			continue;
		}

		const tmdbId = parseTmdbIdOrNull(identity.result.providerId);
		if (tmdbId !== null) {
			return {
				anilistId: input.anilistId,
				mediaType: "movie",
				tmdbId,
			};
		}
	}

	return null;
}

function toSeerrRequestInput(
	target: SeerrRequestTarget | null,
): RequestInSeerrInput | null {
	if (target === null) return null;

	if (target.mediaType === "movie") {
		return {
			anilistId: target.anilistId,
			mediaType: "movie",
			tmdbId: target.tmdbId,
		};
	}

	return {
		anilistId: target.anilistId,
		mediaType: "tv",
		tmdbId: target.tmdbId,
		...(target.tvdbId === undefined ? {} : { tvdbId: target.tvdbId }),
		seasons: target.seasons,
	};
}

export function resolveSeerrRequestInput(input: {
	anilistId: AniListId;
	mappedIdentities: readonly MappingIdentity[];
	seerrRequestTarget: SeerrRequestTarget | null;
}): RequestInSeerrInput | null {
	return (
		toSeerrRequestInput(input.seerrRequestTarget) ??
		getMappedRadarrSeerrRequestInput({
			anilistId: input.anilistId,
			mappedIdentities: input.mappedIdentities,
		})
	);
}
