/** React Query hook for normalized MyAnimeList metadata. */

import { useQuery } from "@tanstack/react-query";
import type {
	MyAnimeListId,
	MyAnimeListMetadata,
} from "@/myanimelist/types";
import { getAni2arrApi } from "@/rpc";
import type { ExtensionError } from "@/shared/errors/error.types";
import { queryKeys } from "./query-keys";

export function useMyAnimeListMetadata(
	malId: MyAnimeListId | undefined,
	options?: { enabled?: boolean },
) {
	return useQuery<MyAnimeListMetadata | null, ExtensionError>({
		queryKey: queryKeys.myAnimeListMetadata(malId ?? 0),
		queryFn: async () => {
			if (!malId) return null;
			return getAni2arrApi().getMyAnimeListMetadata(malId);
		},
		enabled: (options?.enabled ?? true) && malId !== undefined,
		staleTime: 24 * 60 * 60 * 1000,
		gcTime: 30 * 24 * 60 * 60 * 1000,
		retry: 1,
		refetchOnWindowFocus: false,
	});
}
