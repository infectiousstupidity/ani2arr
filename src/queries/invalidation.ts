/** Direct React Query invalidation helpers for mapping and provider cache events. */
// src/queries/invalidation.ts

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { AniListId } from "@/anilist/types";
import {
	sourceIdentityKey,
	type SourceIdentity,
} from "@/mapping/source-identity";
import type { TmdbId } from "@/providers/schemas";
import type { SeerrMediaType } from "@/providers/seerr/types";
import { PROVIDERS, type Provider } from "@/providers/types";
import { queryKeys } from "@/queries/query-keys";

export function invalidateAfterMappingChange(
	queryClient: QueryClient,
	input: { provider: Provider; source: SourceIdentity },
): void {
	queryClient.invalidateQueries({
		queryKey: queryKeys.providerMediaStatusItem(input.provider, input.source),
	});
	queryClient.invalidateQueries({ queryKey: queryKeys.mappings() });
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingIdentitiesRoot(),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingInspectionItem(input.provider, input.source),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.providerLookupRoot(input.provider),
	});

	if (input.provider === "radarr") {
		queryClient.invalidateQueries({ queryKey: queryKeys.seerrTargetsRoot() });
		queryClient.invalidateQueries({
			queryKey: queryKeys.seerrLinkedAniListEntriesRoot(),
		});
	}
}

export function invalidateAfterMappingsRevision(
	queryClient: QueryClient,
	anilistIds: readonly AniListId[] | null = null,
): void {
	if (anilistIds !== null) {
		invalidateAfterScopedMappingsRevision(queryClient, anilistIds);
		return;
	}
	queryClient.invalidateQueries({ queryKey: queryKeys.mappingRoot() });
	queryClient.invalidateQueries({ queryKey: queryKeys.seerrTargetsRoot() });
	queryClient.invalidateQueries({
		queryKey: queryKeys.seerrLinkedAniListEntriesRoot(),
	});
	for (const provider of PROVIDERS) {
		queryClient.invalidateQueries({
			queryKey: queryKeys.providerMediaStatusRoot(provider),
		});
		queryClient.invalidateQueries({
			queryKey: queryKeys.providerLookupRoot(provider),
		});
	}
}

/**
 * Automatic results changed only these AniList entries. Refetch queries for
 * them, plus anything keyed by another source (MAL cards) since this context
 * cannot tell which AniList entry those belong to.
 */
function invalidateAfterScopedMappingsRevision(
	queryClient: QueryClient,
	anilistIds: readonly AniListId[],
): void {
	const changedKeys = new Set(
		anilistIds.map((id) => sourceIdentityKey({ source: "anilist", id })),
	);
	const isAffectedSourceKey = (value: unknown): boolean =>
		typeof value === "string" &&
		(changedKeys.has(value) || !value.startsWith("anilist:"));
	const sourceKeyAt =
		(index: number) =>
		({ queryKey }: { queryKey: QueryKey }): boolean =>
			isAffectedSourceKey(queryKey[index]);

	for (const id of anilistIds) {
		queryClient.invalidateQueries({ queryKey: queryKeys.mappingIdentity(id) });
	}
	queryClient.invalidateQueries({ queryKey: queryKeys.mappings() });
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingInspectionRoot(),
		predicate: sourceKeyAt(4),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.seerrTargetsRoot(),
		predicate: ({ queryKey }) => {
			const request = queryKey[4] as { source?: SourceIdentity } | undefined;
			return (
				request?.source !== undefined &&
				isAffectedSourceKey(sourceIdentityKey(request.source))
			);
		},
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.seerrLinkedAniListEntriesRoot(),
	});
	for (const provider of PROVIDERS) {
		queryClient.invalidateQueries({
			queryKey: queryKeys.providerMediaStatusRoot(provider),
			predicate: sourceKeyAt(4),
		});
		queryClient.invalidateQueries({
			queryKey: queryKeys.providerLookupRoot(provider),
		});
	}
}

export function invalidateAfterProviderLibraryChange(
	queryClient: QueryClient,
	provider: Provider,
): void {
	queryClient.invalidateQueries({
		queryKey: queryKeys.providerMediaStatusRoot(provider),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.providerLookupRoot(provider),
	});
	queryClient.invalidateQueries({ queryKey: queryKeys.mappings() });
}

export function invalidateAfterSeerrRequest(
	queryClient: QueryClient,
	input: { mediaType: SeerrMediaType; tmdbId: TmdbId },
): void {
	queryClient.invalidateQueries({
		queryKey: queryKeys.seerrMediaStatusItem(input.mediaType, input.tmdbId),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.seerrMediaDetails(input),
	});
}

export function invalidateAfterProviderMediaChange(
	queryClient: QueryClient,
	input: { provider: Provider; source: SourceIdentity },
): void {
	queryClient.invalidateQueries({
		queryKey: queryKeys.providerMediaStatusItem(input.provider, input.source),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingInspectionItem(input.provider, input.source),
	});
}

export function resetAfterProviderConnectionChange(
	queryClient: QueryClient,
	provider: Provider,
): void {
	queryClient.removeQueries({
		queryKey: queryKeys.providerRoot(provider),
	});
	queryClient.invalidateQueries({ queryKey: queryKeys.mappings() });
}
