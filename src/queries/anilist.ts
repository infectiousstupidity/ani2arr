/** React Query hooks for AniList media and metadata RPC reads. */
// src/queries/anilist.ts

import { useQuery } from "@tanstack/react-query";
import type { AniListId, AniListMedia } from "@/anilist/types";
import { getAni2arrApi } from "@/rpc";
import type { ExtensionError } from "@/shared/errors/error.types";
import type { GetAniListMetadataOutput } from "@/rpc/types";
import { queryKeys, normalizeMetadataIds } from "./query-keys";

export const useAniListMedia = (
	anilistId: AniListId | undefined,
	opts?: { enabled?: boolean },
) => {
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
		staleTime: 14 * 24 * 60 * 60 * 1000,
		gcTime: 60 * 24 * 60 * 60 * 1000, // 60 days
		retry: 1,
		refetchOnWindowFocus: false,
		refetchOnMount: true,
		meta: { persist: false },
	});
};

export const useAniListMetadataBatch = (
	ids: readonly AniListId[],
	options?: { enabled?: boolean },
) => {
	const normalizedIds = normalizeMetadataIds(ids);
	return useQuery<GetAniListMetadataOutput, ExtensionError>({
		queryKey: queryKeys.aniListMetadata(normalizedIds),
		queryFn: async () => {
			const api = getAni2arrApi();
			return api.getAniListMetadata({
				ids: normalizedIds,
			});
		},
		enabled: (options?.enabled ?? true) && normalizedIds.length > 0,
		staleTime: 12 * 60 * 60 * 1000,
		gcTime: 24 * 60 * 60 * 1000,
		refetchOnWindowFocus: false,
		meta: { persist: false },
	});
};
