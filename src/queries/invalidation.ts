/** Direct React Query invalidation helpers for mapping and provider cache events. */
// src/queries/invalidation.ts

import type { QueryClient } from "@tanstack/react-query";
import type { AniListId } from "@/anilist/types";
import type { SourceIdentity } from "@/mapping/source-identity";
import { PROVIDERS, type Provider } from "@/providers/types";
import { queryKeys } from "@/queries/query-keys";

export function invalidateAfterMappingChange(
	queryClient: QueryClient,
	input: { provider: Provider; source?: SourceIdentity; anilistId?: AniListId },
): void {
	queryClient.invalidateQueries({
		queryKey: queryKeys.providerMediaStatusItem(input.provider, input),
	});
	queryClient.invalidateQueries({ queryKey: queryKeys.mappings() });
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingIdentitiesRoot(),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingInspectionItem(input.provider, input),
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
): void {
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

export function invalidateAfterProviderMediaChange(
	queryClient: QueryClient,
	input: { provider: Provider; source?: SourceIdentity; anilistId?: AniListId },
): void {
	queryClient.invalidateQueries({
		queryKey: queryKeys.providerMediaStatusItem(input.provider, input),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingInspectionItem(input.provider, input),
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
