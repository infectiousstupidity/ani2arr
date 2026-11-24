/** Cross-context revision signals for domain query invalidation. */

import { browser } from "wxt/browser";
import { isAniListId, type AniListId } from "@/anilist/types";
import type { Provider } from "@/providers/types";

const REVISION_SIGNAL_KEYS = {
	mappings: "mappingsRevision",
	sonarrLibrary: "sonarrLibraryRevision",
	radarrLibrary: "radarrLibraryRevision",
} as const;

export const MAPPINGS_REVISION_CHANGE_KEY = REVISION_SIGNAL_KEYS.mappings;
export const SONARR_LIBRARY_REVISION_CHANGE_KEY =
	REVISION_SIGNAL_KEYS.sonarrLibrary;
export const RADARR_LIBRARY_REVISION_CHANGE_KEY =
	REVISION_SIGNAL_KEYS.radarrLibrary;

const writeRevisionSignal = async (storageKey: string): Promise<string> => {
	const next = crypto.randomUUID();
	await browser.storage.local.set({ [storageKey]: next });
	return next;
};

/**
 * Without IDs, every mapping-derived query is stale. With IDs (automatic results),
 * only those AniList entries changed, so tabs can refetch just their cards.
 */
export const bumpMappingsRevision = async (
	anilistIds?: readonly AniListId[],
): Promise<string> => {
	if (anilistIds === undefined) {
		return writeRevisionSignal(REVISION_SIGNAL_KEYS.mappings);
	}
	const id = crypto.randomUUID();
	await browser.storage.local.set({
		[REVISION_SIGNAL_KEYS.mappings]: { id, anilistIds: [...anilistIds] },
	});
	return id;
};

/** AniList IDs a mappings revision is limited to, or null when everything changed. */
export function readMappingsRevisionScope(value: unknown): AniListId[] | null {
	if (value === null || typeof value !== "object") return null;
	const { anilistIds } = value as { anilistIds?: unknown };
	if (!Array.isArray(anilistIds) || !anilistIds.every(isAniListId)) return null;
	return anilistIds;
}

export const bumpProviderLibraryRevision = (
	provider: Provider,
): Promise<string> =>
	writeRevisionSignal(
		provider === "sonarr"
			? REVISION_SIGNAL_KEYS.sonarrLibrary
			: REVISION_SIGNAL_KEYS.radarrLibrary,
	);

export async function resetAllRevisions(): Promise<void> {
	await browser.storage.local.remove(Object.values(REVISION_SIGNAL_KEYS));
}
