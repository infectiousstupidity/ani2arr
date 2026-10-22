/** Cross-context revision signals for domain query invalidation. */

import { browser } from "wxt/browser";
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

export const bumpMappingsRevision = (): Promise<string> =>
	writeRevisionSignal(REVISION_SIGNAL_KEYS.mappings);

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
