/** Syncs query caches with storage-backed invalidation and option storage changes. */
// src/shared/queries/use-a2a-broadcasts.ts

import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { browser } from "wxt/browser";
import { PUBLIC_OPTIONS_CHANGE_KEY } from "@/settings";
import type { Provider } from "@/providers";
import {
	MAPPINGS_REVISION_CHANGE_KEY,
	RADARR_LIBRARY_REVISION_CHANGE_KEY,
	SONARR_LIBRARY_REVISION_CHANGE_KEY,
} from "@/shared/sync/revisions";
import { queryKeys } from "@/queries/query-keys";

const PUBLIC_OPTIONS_KEY = queryKeys.publicOptions();

export function useA2aBroadcasts(): void {
	const queryClient = useQueryClient();

	const refreshSettingsQueries = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: PUBLIC_OPTIONS_KEY });
	}, [queryClient]);

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

			if (changes[PUBLIC_OPTIONS_CHANGE_KEY]) {
				refreshSettingsQueries();
			}
		};

		browser.storage.onChanged.addListener(onStorageChanged);
		return () => browser.storage.onChanged.removeListener(onStorageChanged);
	}, [refreshLibraryQueries, refreshMappingsQueries, refreshSettingsQueries]);
}
