/** React Query hooks for AniList media and metadata RPC reads. */
// src/queries/anilist.ts

import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { AniListId } from "@/anilist";
import { getAni2arrApi } from "@/rpc";
import type { ExtensionError } from "@/shared/errors";
import type { AniListMedia } from "@/anilist/schemas/media.schema";
import type { GetAniListMetadataOutput } from "@/rpc/types";
import { queryKeys, normalizeMetadataIds } from "./query-keys";

export const useAniListMedia = (
	anilistId: AniListId | undefined,
	opts?: { enabled?: boolean; forceRefresh?: boolean },
) => {
	const forceRefresh = opts?.forceRefresh ?? false;

	return useQuery<AniListMedia | null, ExtensionError>({
		queryKey: anilistId
			? queryKeys.aniListMedia(anilistId)
			: ["a2a", "aniListMedia", 0],
		queryFn: async () => {
			if (!anilistId) return null;
			const api = getAni2arrApi();
			const media = await api.fetchAniListMedia(anilistId);
			return media ?? null;
		},
		enabled: (opts?.enabled ?? true) && Boolean(anilistId),
		staleTime: forceRefresh ? 0 : 14 * 24 * 60 * 60 * 1000, // 14 days
		gcTime: 60 * 24 * 60 * 60 * 1000, // 60 days
		retry: 1,
		refetchOnWindowFocus: false,
		refetchOnMount: forceRefresh ? "always" : true,
		meta: { persist: false },
	});
};

export async function prefetchAniListMediaQueries(
	queryClient: QueryClient,
	ids: readonly AniListId[],
): Promise<number> {
	const idsToFetch: AniListId[] = [];
	for (const id of normalizeMetadataIds(ids)) {
		if (queryClient.getQueryData(queryKeys.aniListMedia(id)) !== undefined) {
			continue;
		}
		if (
			queryClient.isFetching({
				queryKey: queryKeys.aniListMedia(id),
				exact: true,
			}) > 0
		) {
			continue;
		}

		idsToFetch.push(id);
		if (idsToFetch.length >= 50) break;
	}

	if (idsToFetch.length === 0) return 0;

	const entries = await getAni2arrApi().prefetchAniListMedia(idsToFetch);
	for (const [id, media] of entries) {
		queryClient.setQueryData(queryKeys.aniListMedia(id), media);
	}

	return entries.length;
}

export const useAniListMetadataBatch = (
	ids: readonly AniListId[],
	options?: { enabled?: boolean; refreshStale?: boolean },
) => {
	const normalizedIds = normalizeMetadataIds(ids);
	return useQuery<GetAniListMetadataOutput, ExtensionError>({
		queryKey: queryKeys.aniListMetadata(normalizedIds),
		queryFn: async () => {
			const api = getAni2arrApi();
			return api.getAniListMetadata({
				ids: normalizedIds,
				refreshStale: options?.refreshStale ?? true,
			});
		},
		enabled: (options?.enabled ?? true) && normalizedIds.length > 0,
		staleTime: 12 * 60 * 60 * 1000,
		gcTime: 24 * 60 * 60 * 1000,
		refetchOnWindowFocus: false,
		meta: { persist: false },
	});
};
