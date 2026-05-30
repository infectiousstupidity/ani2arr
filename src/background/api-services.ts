/** Background-owned singleton services used by the Ani2arr RPC implementation. */
// src/background/api/api-services.ts

import { AniListMediaService, AniListMetadataStore } from "@/anilist";
import { anilistMediaCache } from "@/anilist/media.cache";
import {
	createRadarrTitleLookup,
	createSonarrTitleLookup,
} from "@/mapping/auto-mapping/lookup/provider-title-lookup";
import {
	radarrTitleLookupCache,
	sonarrTitleLookupCache,
} from "@/mapping/auto-mapping/lookup/lookup.cache";
import { AutoMappingStore } from "@/mapping/auto-mapping/auto-mapping.store";
import { MappingService } from "@/mapping/mapping.service";
import { ManualMappingService } from "@/mapping/manual-mapping";
import { AnibridgeMappingStore } from "@/mapping/upstream-mapping";
import { anibridgeMappingCache } from "@/mapping/upstream-mapping/anibridge-mapping.cache";
import type { Provider } from "@/providers";
import { RadarrClient } from "@/providers/radarr/client";
import { RadarrLibrary } from "@/providers/radarr/library";
import {
	getProviderHostPermissionPattern,
	hasProviderHostPermission,
	removeProviderHostPermission,
} from "@/providers/settings/host-permissions";
import { SonarrClient } from "@/providers/sonarr/client";
import { SonarrLibrary } from "@/providers/sonarr/library";
import {
	getExtensionOptionsSnapshot,
	getProviderCredentials,
	hasConfiguredProviderCredentials,
	resetAllSettingsSnapshot,
	type ExtensionOptions,
} from "@/settings";
import { clearAllTtlCaches } from "@/shared/cache/ttl-cache";
import { logError, normalizeError } from "@/shared/errors";
import {
	bumpMappingsRevision as bumpMappingsRevisionSignal,
	bumpProviderLibraryRevision,
	resetAllRevisions,
} from "@/shared/sync/revisions";
import { logger } from "@/shared/utils/logger";
import { requireProviderCredentials } from "./provider-config";

const DEBOUNCED_LIBRARY_REFRESH_MS = 15 * 1000;

const revisionState = {
	mappings: 0,
	sonarrLibrary: 0,
	radarrLibrary: 0,
};

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
	(provider: Provider) =>
	async (url: string): Promise<boolean> => {
		const result = await hasProviderHostPermission(url);
		if (!result.ok) {
			logError(
				normalizeError(result.error),
				`Ani2arrApi:${provider}:hasUrlPermission`,
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

export const sonarrLibrary = new SonarrLibrary({ client: sonarrClient });
export const radarrLibrary = new RadarrLibrary({ client: radarrClient });

export const anilistMediaService = new AniListMediaService({
	media: anilistMediaCache,
});
export const anibridgeMappingStore = new AnibridgeMappingStore(
	anibridgeMappingCache,
);
export const anilistMetadataStore = new AniListMetadataStore(
	anilistMediaService,
);

const sonarrTitleLookupClient = createSonarrTitleLookup(
	sonarrClient,
	sonarrTitleLookupCache,
);
const radarrTitleLookupClient = createRadarrTitleLookup(
	radarrClient,
	radarrTitleLookupCache,
);

export const manualMappingService = new ManualMappingService();
export const manualMappingsReady = manualMappingService.init();
export const autoMappingStore = new AutoMappingStore();

export const bumpMappingsRevision = async (): Promise<void> => {
	revisionState.mappings += 1;
	await bumpMappingsRevisionSignal();
};

export const mappingService = new MappingService({
	anilistApi: anilistMediaService,
	anibridgeMappingStore,
	lookupClients: {
		sonarr: sonarrTitleLookupClient,
		radarr: radarrTitleLookupClient,
	},
	autoMappingStore,
	getConfiguredCredentials: requireProviderCredentials,
	manualMappings: manualMappingService,
	notifyMappingsChanged: bumpMappingsRevision,
});

export const bumpLibraryRevision = async (
	provider: Provider,
): Promise<void> => {
	if (provider === "sonarr") revisionState.sonarrLibrary += 1;
	else revisionState.radarrLibrary += 1;
	await bumpProviderLibraryRevision(provider);
};

const refreshProviderLibrary = async (
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

export const handleProviderConnectionChanged = async (
	optionsHint?: ExtensionOptions,
	input?: {
		changedProviders?: Provider[];
		disconnectedProviders?: Provider[];
	},
): Promise<void> => {
	const options = optionsHint ?? (await getExtensionOptionsSnapshot());
	logger.configure({ enabled: options.debugLogging || import.meta.env.DEV });

	const changedProviders = [...new Set(input?.changedProviders)];
	if (changedProviders.length === 0) return;

	await Promise.all(
		changedProviders.map((provider) =>
			mappingService.resetLookupState(provider),
		),
	);
	await bumpMappingsRevision();

	if (hasConfiguredProviderCredentials(options, "sonarr")) {
		await mappingService.initAnibridgeMappings();
	}

	await Promise.all(
		changedProviders.map((provider) =>
			refreshProviderLibrary(provider, options),
		),
	);
	await Promise.all(
		changedProviders.map((provider) => bumpLibraryRevision(provider)),
	);
};

export const clearPersistentCaches = async (): Promise<void> => {
	await Promise.all([
		anilistMetadataStore.clearLocalCache(),
		mappingService.resetLookupState(),
		anibridgeMappingStore.clear(),
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
	await manualMappingsReady;
	const previousOptions = await getExtensionOptionsSnapshot();

	await manualMappingService.clearAll();
	await clearPersistentCaches();
	await resetAllSettingsSnapshot();
	await removeConfiguredProviderHostPermissions(previousOptions);
};

export const getMappingListRevision = (): {
	mappings: number;
	anibridge: number;
	sonarrLibrary: number;
	radarrLibrary: number;
} => ({
	...revisionState,
	anibridge: anibridgeMappingStore.getRevision(),
});
