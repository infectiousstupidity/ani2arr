/** React Query hooks for AniList media and metadata RPC reads. */
// src/shared/queries/metadata.ts

import { useQuery } from "@tanstack/react-query";
import type { AniListId } from "@/anilist";
import { getAni2arrApi } from "@/rpc";
import { normalizeError, type ExtensionError } from "@/shared/errors";
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
			try {
				const api = getAni2arrApi();
				const media = await api.fetchAniListMedia(anilistId);
				return media ?? null;
			} catch (error) {
				const normalized = normalizeError(error);
				console.error(
					"[useAniListMedia] Failed to fetch AniList media:",
					normalized,
				);
				throw normalized;
			}
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
