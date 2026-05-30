/** Syncs query caches with storage-backed revision invalidation events. */
// src/queries/use-a2a-broadcasts.ts

import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { browser } from "wxt/browser";
import type { Provider } from "@/providers";
import { queryKeys } from "@/queries/query-keys";
import {
	MAPPINGS_REVISION_CHANGE_KEY,
	RADARR_LIBRARY_REVISION_CHANGE_KEY,
	SONARR_LIBRARY_REVISION_CHANGE_KEY,
} from "@/shared/sync/revisions";

export function useA2aBroadcasts(): void {
	const queryClient = useQueryClient();

	const refreshMappingsQueries = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
	}, [queryClient]);

	const refreshLibraryQueries = useCallback(
		(provider: Provider) => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.seriesStatusRoot(provider),
			});
		},
		[queryClient],
	);

	useEffect(() => {
		const onStorageChanged: Parameters<
			typeof browser.storage.onChanged.addListener
		>[0] = (changes, areaName) => {
			if (areaName !== "local") return;

			if (changes[SONARR_LIBRARY_REVISION_CHANGE_KEY]) {
				refreshLibraryQueries("sonarr");
			}

			if (changes[RADARR_LIBRARY_REVISION_CHANGE_KEY]) {
				refreshLibraryQueries("radarr");
			}

			if (changes[MAPPINGS_REVISION_CHANGE_KEY]) {
				refreshMappingsQueries();
			}
		};

		browser.storage.onChanged.addListener(onStorageChanged);
		return () => browser.storage.onChanged.removeListener(onStorageChanged);
	}, [refreshLibraryQueries, refreshMappingsQueries]);
}
