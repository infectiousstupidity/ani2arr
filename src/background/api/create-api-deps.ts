/** Background API dependency assembly for the Ani2arr RPC implementation. */
// src/background/api/create-api-deps.ts

import { clearAllTtlCaches } from "@/shared/cache/ttl-cache";
import {
	bumpMappingsRevision as bumpMappingsRevisionSignal,
	bumpProviderLibraryRevision,
	resetAllRevisions,
} from "@/shared/sync/revisions";
import {
	radarrTitleLookupCache,
	sonarrTitleLookupCache,
} from "@/mapping/auto-mapping/lookup/lookup.cache";
import { anibridgeMappingCache } from "@/mapping/upstream-mapping/anibridge-mapping.cache";
import { anilistMediaCache } from "@/anilist/media.cache";
import { SonarrClient } from "@/providers/sonarr/client";
import { SonarrLibrary } from "@/providers/sonarr/library";
import { RadarrClient } from "@/providers/radarr/client";
import { RadarrLibrary } from "@/providers/radarr/library";
import {
	getProviderHostPermissionPattern,
	hasProviderHostPermission,
	removeProviderHostPermission,
} from "@/providers/settings/host-permissions";
import { AniListMediaService, AniListMetadataStore } from "@/anilist";
import { MappingService } from "@/mapping/mapping.service";
import { ManualMappingService } from "@/mapping/manual-mapping";
import { AutoMappingStore } from "@/mapping/auto-mapping/auto-mapping.store";
import { AnibridgeMappingStore } from "@/mapping/upstream-mapping";
import {
	createRadarrTitleLookup,
	createSonarrTitleLookup,
} from "@/mapping/auto-mapping/lookup/provider-title-lookup";
import {
	createDefaultExtensionOptions,
	getProviderCredentials,
	getExtensionOptionsSnapshot,
	setExtensionOptionsSnapshot,
	hasConfiguredProviderCredentials,
	type ExtensionOptions,
} from "@/options";
import type { Provider } from "@/providers";
import { logError, normalizeError } from "@/shared/errors";
import type { ApiHandlerDeps } from "@/rpc/handlers/handler-deps";
import { logger } from "@/shared/utils/logger";
import { createProviderConfigReader } from "./provider-config-reader";

const DEBOUNCED_LIBRARY_REFRESH_MS = 45 * 1000;

const bumpMappingsRevision = async (): Promise<void> => {
	await bumpMappingsRevisionSignal();
};

const bindAll = <T extends object>(instance: T): T => {
	const proto = Object.getPrototypeOf(instance) as Record<
		string,
		unknown
	> | null;
	if (!proto) return instance;

	for (const key of Object.getOwnPropertyNames(proto)) {
		if (key === "constructor") continue;
		const descriptor = Object.getOwnPropertyDescriptor(proto, key);
		if (descriptor && typeof descriptor.value === "function") {
			const fn = descriptor.value as (...args: unknown[]) => unknown;
			Object.defineProperty(instance, key, {
				...descriptor,
				value: fn.bind(instance),
			});
		}
	}

	return instance;
};

export const createApiDeps = (): ApiHandlerDeps => {
	const providerConfig = createProviderConfigReader();

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

	const sonarrClient = bindAll(
		new SonarrClient({
			hasUrlPermission: createHasUrlPermission("sonarr"),
		}),
	);
	const radarrClient = bindAll(
		new RadarrClient({ hasUrlPermission: createHasUrlPermission("radarr") }),
	);
	const sonarrSeriesLibrary = bindAll(
		new SonarrLibrary({ client: sonarrClient }),
	);

	const anilistMediaService = bindAll(
		new AniListMediaService({
			media: anilistMediaCache,
		}),
	);

	const anibridgeMappingStore = new AnibridgeMappingStore(
		anibridgeMappingCache,
	);
	const lookupClient = createSonarrTitleLookup(
		sonarrClient,
		sonarrTitleLookupCache,
	);
	const radarrLookupClient = createRadarrTitleLookup(
		radarrClient,
		radarrTitleLookupCache,
	);

	const manualMappingService = new ManualMappingService();
	const manualMappingsReady = manualMappingService.init();
	const autoMappingStore = new AutoMappingStore();

	const mappingService = bindAll(
		new MappingService({
			anilistApi: anilistMediaService,
			anibridgeMappingStore,
			lookupClients: {
				sonarr: lookupClient,
				radarr: radarrLookupClient,
			},
			autoMappingStore,
			getConfiguredCredentials: providerConfig.requireCredentials,
			manualMappings: manualMappingService,
			notifyMappingsChanged: () => {
				void bumpMappingsRevision();
			},
		}),
	);

	const anilistMetadataStore = new AniListMetadataStore(anilistMediaService);

	void getExtensionOptionsSnapshot()
		.then((options) => {
			logger.configure({
				enabled: (options?.debugLogging ?? false) || import.meta.env.DEV,
			});
		})
		.catch(() => {});

	const pendingLibraryRefresh: Record<
		Provider,
		ReturnType<typeof setTimeout> | null
	> = {
		sonarr: null,
		radarr: null,
	};

	const refreshOptionsHint: Record<Provider, ExtensionOptions | null> = {
		sonarr: null,
		radarr: null,
	};

	const bumpLibraryRevision = async (provider: Provider): Promise<void> => {
		await bumpProviderLibraryRevision(provider);
	};

	const refreshProviderLibrary = async (
		provider: Provider,
		options: ExtensionOptions,
	): Promise<void> => {
		if (provider === "sonarr") {
			const credentials = getProviderCredentials(options, "sonarr");
			if (!credentials) {
				await sonarrLibrary.clearSeriesSnapshotCache();
				return;
			}

			await sonarrLibrary.refreshSeriesSnapshots(credentials);
			return;
		}

		const credentials = getProviderCredentials(options, "radarr");
		if (!credentials) {
			await radarrLibrary.clearMovieSnapshotCache();
			return;
		}

		await radarrLibrary.refreshMovieSnapshots(credentials);
	};

	const sonarrLibrary = sonarrSeriesLibrary;

	const radarrLibrary = bindAll(
		new RadarrLibrary({
			client: radarrClient,
		}),
	);

	const scheduleLibraryRefresh = (
		provider: Provider,
		optionsHint?: ExtensionOptions,
	): void => {
		if (optionsHint) {
			refreshOptionsHint[provider] = optionsHint;
		}

		if (pendingLibraryRefresh[provider] !== null) return;

		pendingLibraryRefresh[provider] = globalThis.setTimeout(async () => {
			pendingLibraryRefresh[provider] = null;

			try {
				const options =
					refreshOptionsHint[provider] ?? (await getExtensionOptionsSnapshot());
				refreshOptionsHint[provider] = null;

				if (!hasConfiguredProviderCredentials(options, provider)) return;

				if (provider === "sonarr") {
					await refreshProviderLibrary("sonarr", options);
					return;
				}

				await refreshProviderLibrary("radarr", options);
			} catch (error) {
				logError(
					normalizeError(error),
					`Ani2arrApi:debouncedLibraryRefresh:${provider}`,
				);
			}
		}, DEBOUNCED_LIBRARY_REFRESH_MS);
	};

	const handleProviderConnectionChanged = async (
		optionsHint?: ExtensionOptions,
		input?: {
			changedProviders?: Provider[];
			disconnectedProviders?: Provider[];
		},
	): Promise<void> => {
		logger.configure({
			enabled: (optionsHint?.debugLogging ?? false) || import.meta.env.DEV,
		});

		const changedProviders = [...new Set(input?.changedProviders)];
		const options = optionsHint ?? (await getExtensionOptionsSnapshot());

		if (changedProviders.length === 0) {
			return;
		}

		await Promise.all(
			changedProviders.map(async (provider) => {
				await mappingService.resetLookupState(provider);
			}),
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

	const clearPersistentCaches = async (): Promise<void> => {
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
		const configuredUrls = [
			{ provider: "sonarr" as const, url: options.providers.sonarr.url },
			{ provider: "radarr" as const, url: options.providers.radarr.url },
		];
		const removalsByPattern = new Map<
			string,
			{ provider: Provider; url: string }
		>();

		for (const { provider, url } of configuredUrls) {
			if (!url) continue;

			const pattern = getProviderHostPermissionPattern(String(url));
			if (!pattern.ok) {
				logError(
					normalizeError(pattern.error),
					`Ani2arrApi:resetExtensionState:${provider}:removePermission`,
				);
				continue;
			}

			removalsByPattern.set(pattern.value, { provider, url: String(url) });
		}

		await Promise.all(
			[...removalsByPattern.values()].map(async ({ provider, url }) => {
				const removal = await removeProviderHostPermission(url);
				if (!removal.ok) {
					logError(
						normalizeError(removal.error),
						`Ani2arrApi:resetExtensionState:${provider}:removePermission`,
					);
					return;
				}

				if (!removal.value.removed) {
					logError(
						normalizeError(
							new Error(
								`Permission removal rejected for ${removal.value.pattern}.`,
							),
						),
						`Ani2arrApi:resetExtensionState:${provider}:removePermission`,
					);
				}
			}),
		);
	};

	const resetExtensionState = async (): Promise<void> => {
		await manualMappingsReady;

		const previousOptions = await getExtensionOptionsSnapshot();
		const defaults = createDefaultExtensionOptions();

		await manualMappingService.clearAll();
		await clearPersistentCaches();
		await setExtensionOptionsSnapshot(defaults);
		await removeConfiguredProviderHostPermissions(previousOptions);
	};

	return {
		sonarrClient,
		sonarrLookupClient: sonarrClient,
		radarrClient,
		anilistMediaService,
		mappingService,
		manualMappingService,
		autoMappingStore,
		anibridgeMappingStore,
		sonarrLibrary,
		radarrLibrary,
		anilistMetadataStore,
		manualMappingsReady,
		providerConfig,
		scheduleLibraryRefresh,
		bumpLibraryRevision,
		bumpMappingsRevision,
		handleProviderConnectionChanged,
		clearPersistentCaches,
		resetExtensionState,
	};
};
