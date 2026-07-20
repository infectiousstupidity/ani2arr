/** Syncs query caches with storage-backed revision invalidation events. */
// src/queries/use-a2a-broadcasts.ts

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { browser } from "wxt/browser";
import {
	invalidateAfterMappingsRevision,
	invalidateAfterProviderLibraryChange,
} from "@/queries/invalidation";
import {
	MAPPINGS_REVISION_CHANGE_KEY,
	RADARR_LIBRARY_REVISION_CHANGE_KEY,
	SONARR_LIBRARY_REVISION_CHANGE_KEY,
} from "@/rpc/revision-signals";

export function useA2aBroadcasts(): void {
	const queryClient = useQueryClient();

	useEffect(() => {
		const onStorageChanged: Parameters<
			typeof browser.storage.onChanged.addListener
		>[0] = (changes, areaName) => {
			if (areaName !== "local") return;

			if (changes[SONARR_LIBRARY_REVISION_CHANGE_KEY]) {
				invalidateAfterProviderLibraryChange(queryClient, "sonarr");
			}

			if (changes[RADARR_LIBRARY_REVISION_CHANGE_KEY]) {
				invalidateAfterProviderLibraryChange(queryClient, "radarr");
			}

			if (changes[MAPPINGS_REVISION_CHANGE_KEY]) {
				invalidateAfterMappingsRevision(queryClient);
			}
		};

		browser.storage.onChanged.addListener(onStorageChanged);
		return () => browser.storage.onChanged.removeListener(onStorageChanged);
	}, [queryClient]);
}
