/** Background-owned singleton services used by the Ani2arr RPC implementation. */
// src/background/api-services.ts

import { anilistMediaCache, AniListMediaService } from "@/anilist/media.service";
import { AniListMetadataStore } from "@/anilist/metadata.store";
import { clearAutoResults } from "@/mapping/auto.store";
import { clearIdsMoeCache } from "@/mapping/idsmoe.store";
import { clearManualFacts } from "@/mapping/manual.store";
import { clearManualSeerrTargets } from "@/mapping/seerr-target.store";
import { MappingService } from "@/mapping/mapping.service";
import { createAutomaticResolver } from "@/mapping/resolve/resolve";
import {
	clearUpstreamMappings,
	refreshUpstreamMappings,
} from "@/mapping/upstream.store";
import type { Provider } from "@/providers/types";
import { RadarrClient } from "@/providers/radarr/client";
import { RadarrLibrary } from "@/providers/radarr/library";
import { SeerrClient } from "@/providers/seerr/client";
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
import {
	getProviderCredentials,
	hasConfiguredProviderCredentials,
} from "@/settings/provider-config";
import { hasConfiguredSeerrCredentials } from "@/settings/seerr-config";
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
import { logger } from "@/shared/utils/logger";
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

export const mappingService = new MappingService(
	createAutomaticResolver({
		anilistMedia: anilistMediaService,
		sonarr: sonarrClient,
		radarr: radarrClient,
		getCredentials: requireProviderCredentials,
	}),
);

export const bumpLibraryRevision = async (
	provider: Provider,
): Promise<void> => {
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

	const affectedProviders = [
		...new Set([
			...(input?.changedProviders ?? []),
			...(input?.disconnectedProviders ?? []),
		]),
	];
	if (affectedProviders.length === 0) return;

	await bumpMappingsRevision();

	if (
		hasConfiguredProviderCredentials(options, "sonarr") ||
		hasConfiguredProviderCredentials(options, "radarr") ||
		hasConfiguredSeerrCredentials(options)
	) {
		await refreshUpstreamMappings();
	}

	await Promise.all(
		affectedProviders.map((provider) =>
			refreshProviderLibrary(provider, options),
		),
	);
	await Promise.all(
		affectedProviders.map((provider) => bumpLibraryRevision(provider)),
	);
};

export const clearPersistentCaches = async (): Promise<void> => {
	await Promise.all([
		anilistMetadataStore.clearLocalCache(),
		clearIdsMoeCache(),
		clearUpstreamMappings(),
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
};
