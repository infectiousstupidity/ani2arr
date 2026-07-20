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
	queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingIdentitiesRoot(),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingInspection(input.provider, input),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.providerLookupRoot(input.provider),
	});
}

export function invalidateAfterMappingsRevision(
	queryClient: QueryClient,
): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingInspectionRoot(),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingIdentitiesRoot(),
	});
	queryClient.invalidateQueries({ queryKey: queryKeys.seerrTargetsRoot() });
	for (const provider of PROVIDERS) {
		queryClient.invalidateQueries({
			queryKey: queryKeys.providerMediaStatusRoot(provider),
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
	queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
}

export function invalidateAfterProviderMediaChange(
	queryClient: QueryClient,
	input: { provider: Provider; source?: SourceIdentity; anilistId?: AniListId },
): void {
	queryClient.invalidateQueries({
		queryKey: queryKeys.providerMediaStatusItem(input.provider, input),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingInspection(input.provider, input),
	});
}

export function resetAfterProviderConnectionChange(
	queryClient: QueryClient,
	provider: Provider,
): void {
	queryClient.removeQueries({
		queryKey: queryKeys.providerRoot(provider),
	});
	queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
}
