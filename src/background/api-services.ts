/** Background-owned singleton services used by the Ani2arr RPC implementation. */
// src/background/api-services.ts

import { anilistMediaCache, AniListMediaService } from "@/anilist/media.service";
import { AniListMetadataStore } from "@/anilist/metadata.store";
import { clearAutoResults } from "@/mapping/auto.store";
import { clearManualFacts } from "@/mapping/manual.store";
import { clearManualSeerrTargets } from "@/mapping/seerr-target.store";
import { MappingService } from "@/mapping/mapping.service";
import { createAutomaticResolver } from "@/mapping/resolve/resolve";
import { clearUpstreamMappings } from "@/mapping/upstream.store";
import type { Provider } from "@/providers/types";
import { RadarrClient } from "@/providers/radarr/client";
import { RadarrLibrary } from "@/providers/radarr/library";
import { SeerrClient } from "@/providers/seerr/client";
import { getSeerrXsrfToken } from "@/providers/seerr/csrf-token";
import {
	getProviderHostPermissionPattern,
	hasProviderHostPermission,
	removeProviderHostPermission,
} from "@/providers/settings/host-permissions";
import { SonarrClient } from "@/providers/sonarr/client";
import { SonarrLibrary } from "@/providers/sonarr/library";
import {
	getExtensionOptionsSnapshot,
	resetAllSettingsSnapshot,
} from "@/settings/store";
import { removeSeerrCsrfCookiePermission } from "@/settings/provider-permissions";
import {
	getProviderCredentials,
	hasConfiguredProviderCredentials,
} from "@/settings/provider-config";
import type { ExtensionOptions } from "@/settings/types";
import { clearAllTtlCaches } from "@/shared/cache/ttl-cache";
import {
	logError,
	normalizeError,
} from "@/shared/errors/error-utils";
import {
	bumpMappingsRevision as bumpMappingsRevisionSignal,
	bumpProviderLibraryRevision,
	resetAllRevisions,
} from "@/shared/sync/revisions";
import { fetchProviderCandidates } from "./provider-candidate-search";
import { requireProviderCredentials } from "./provider-config";

const DEBOUNCED_LIBRARY_REFRESH_MS = 15 * 1000;

function createDebouncer(ms: number) {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	return (fn: () => Promise<void>) => {
		if (timeoutId !== null) clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			timeoutId = null;
			fn().catch((error) =>
				logError(normalizeError(error), "Ani2arrApi:debounce"),
			);
		}, ms);
	};
}

const createHasUrlPermission =
	(scope: string) =>
	async (url: string): Promise<boolean> => {
		const result = await hasProviderHostPermission(url);
		if (!result.ok) {
			logError(
				normalizeError(result.error),
				`Ani2arrApi:${scope}:hasUrlPermission`,
			);
			return false;
		}
		return result.value;
	};

export const sonarrClient = new SonarrClient({
	hasUrlPermission: createHasUrlPermission("sonarr"),
});
export const radarrClient = new RadarrClient({
	hasUrlPermission: createHasUrlPermission("radarr"),
});
export const seerrClient = new SeerrClient({
	hasUrlPermission: createHasUrlPermission("seerr"),
	getCsrfToken: getSeerrXsrfToken,
});

export const sonarrLibrary = new SonarrLibrary(sonarrClient);
export const radarrLibrary = new RadarrLibrary(radarrClient);

export const anilistMediaService = new AniListMediaService({
	media: anilistMediaCache,
});
export const anilistMetadataStore = new AniListMetadataStore();

export const bumpMappingsRevision = async (): Promise<void> => {
	await bumpMappingsRevisionSignal();
};

const searchProviderCandidates = (provider: Provider, title: string) =>
	fetchProviderCandidates(provider, title, {
		getCredentials: requireProviderCredentials,
		sonarr: sonarrClient,
		radarr: radarrClient,
	});

export const mappingService = new MappingService(
	createAutomaticResolver({
		anilistMedia: anilistMediaService,
		searchProviderCandidates,
	}),
);

export const bumpLibraryRevision = async (
	provider: Provider,
): Promise<void> => {
	await bumpProviderLibraryRevision(provider);
};

export const refreshProviderLibrary = async (
	provider: Provider,
	options: ExtensionOptions,
): Promise<void> => {
	const credentials = getProviderCredentials(options, provider);

	if (provider === "sonarr") {
		if (!credentials) {
			await sonarrLibrary.clearSeriesSnapshotCache();
			return;
		}
		await sonarrLibrary.refreshSeriesSnapshots(credentials);
		return;
	}

	if (!credentials) {
		await radarrLibrary.clearMovieSnapshotCache();
		return;
	}
	await radarrLibrary.refreshMovieSnapshots(credentials);
};

const sonarrDebouncer = createDebouncer(DEBOUNCED_LIBRARY_REFRESH_MS);
const radarrDebouncer = createDebouncer(DEBOUNCED_LIBRARY_REFRESH_MS);

export const scheduleLibraryRefresh = (provider: Provider): void => {
	const debouncer = provider === "sonarr" ? sonarrDebouncer : radarrDebouncer;
	debouncer(async () => {
		const options = await getExtensionOptionsSnapshot();
		if (!hasConfiguredProviderCredentials(options, provider)) return;
		await refreshProviderLibrary(provider, options);
	});
};

export const clearPersistentCaches = async (): Promise<void> => {
	await Promise.all([
		anilistMetadataStore.clearLocalCache(),
		clearUpstreamMappings(),
		sonarrLibrary.clearSeriesSnapshotCache(),
		radarrLibrary.clearMovieSnapshotCache(),
	]);
	await clearAllTtlCaches();
	await resetAllRevisions();
};

const removeConfiguredProviderHostPermissions = async (
	options: ExtensionOptions,
): Promise<void> => {
	const urls = [
		options.providers.sonarr.url,
		options.providers.radarr.url,
		options.seerr.url,
	].filter((url): url is string => !!url);

	const uniqueUrls = new Set(urls);

	await Promise.all(
		[...uniqueUrls].map(async (url) => {
			const pattern = getProviderHostPermissionPattern(url);
			if (!pattern.ok)
				return logError(
					normalizeError(pattern.error),
					`Ani2arrApi:removePermission`,
				);

			const removal = await removeProviderHostPermission(url);
			if (!removal.ok)
				return logError(
					normalizeError(removal.error),
					`Ani2arrApi:removePermission`,
				);

			if (!removal.value.removed) {
				logError(
					normalizeError(
						new Error(
							`Permission removal rejected for ${removal.value.pattern}.`,
						),
					),
					`Ani2arrApi:removePermission`,
				);
			}
		}),
	);
};

export const resetExtensionState = async (): Promise<void> => {
	const previousOptions = await getExtensionOptionsSnapshot();

	await clearManualFacts();
	await clearManualSeerrTargets();
	await Promise.all([clearAutoResults("sonarr"), clearAutoResults("radarr")]);
	await clearPersistentCaches();
	await resetAllSettingsSnapshot();
	await removeConfiguredProviderHostPermissions(previousOptions);
	await removeSeerrCsrfCookiePermission();
};
