/** Background API dependency assembly for the Ani2arr RPC implementation. */
// src/background/api/create-api-deps.ts

import { clearAllTtlCaches } from "@/shared/cache/ttl-cache";
import {
	bumpMappingsRevision as bumpMappingsRevisionSignal,
	bumpProviderLibraryRevision,
	resetAllRevisions,
} from "@/shared/sync/revisions";
import {
	radarrLookupCaches,
	sonarrLookupCaches,
} from "@/mapping/lookup/lookup.cache";
import { anibridgeMappingCache } from "@/mapping/upstream-mapping/anibridge-mapping.cache";
import { anilistMediaCache } from "@/anilist/media.cache";
import { providerLibraryCaches } from "@/providers/library/cache";
import { SonarrClient } from "@/providers/clients/sonarr.client";
import { RadarrClient } from "@/providers/clients/radarr.client";
import {
	hasProviderHostPermission,
	removeProviderHostPermission,
} from "@/providers/settings/host-permissions";
import { AniListMediaService, AniListMetadataStore } from "@/anilist";
import { RadarrLibrary } from "@/providers/library/radarr-library";
import { SonarrLibrary } from "@/providers/library/sonarr-library";
import { MappingService } from "@/mapping/mapping.service";
import { ManualMappingService } from "@/mapping/manual-mapping";
import { AutoMappingStore } from "@/mapping/auto-mapping/auto-mapping.store";
import { AnibridgeMappingStore } from "@/mapping/upstream-mapping";
import { SonarrLookupClient, RadarrLookupClient } from "@/mapping/lookup";
import {
	createDefaultExtensionOptions,
	getExtensionOptionsSnapshot,
	setExtensionOptionsSnapshot,
	getProviderCredentials,
	hasConfiguredProviderCredentials,
	type ExtensionOptions,
} from "@/options";
import type { Provider, ProviderCredentials } from "@/providers";
import { getProviderLabel } from "@/providers/provider-labels";
import {
	createError,
	ErrorCode,
	logError,
	normalizeError,
} from "@/shared/errors";
import type { ApiHandlerDeps } from "@/rpc/handlers/handler-deps";
import { logger } from "@/shared/utils/logger";

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
		new SonarrClient({ hasUrlPermission: createHasUrlPermission("sonarr") }),
	);
	const radarrClient = bindAll(
		new RadarrClient({ hasUrlPermission: createHasUrlPermission("radarr") }),
	);

	const anilistMediaService = bindAll(
		new AniListMediaService({
			media: anilistMediaCache,
		}),
	);

	const anibridgeMappingStore = new AnibridgeMappingStore(
		anibridgeMappingCache,
	);
	const lookupClient = new SonarrLookupClient(sonarrClient, sonarrLookupCaches);
	const radarrLookupClient = new RadarrLookupClient(
		radarrClient,
		radarrLookupCaches,
	);

	const manualMappingService = new ManualMappingService();
	const manualMappingsReady = manualMappingService.init();
	const autoMappingStore = new AutoMappingStore();

	const mappingService = bindAll(
		new MappingService(
			anilistMediaService,
			anibridgeMappingStore,
			{
				sonarr: lookupClient,
				radarr: radarrLookupClient,
			},
			autoMappingStore,
			manualMappingService,
			() => {
				void bumpMappingsRevision();
			},
		),
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

	const clearProviderClientCache = (provider: Provider): void => {
		if (provider === "sonarr") {
			sonarrClient.clearEtagCache();
			return;
		}

		radarrClient.clearEtagCache();
	};

	const refreshProviderLibrary = async (
		provider: Provider,
		options: ExtensionOptions,
	): Promise<void> => {
		if (provider === "sonarr") {
			await sonarrLibrary.refreshCache(options);
			return;
		}

		await radarrLibrary.refreshCache(options);
	};

	const sonarrLibrary = bindAll(
		new SonarrLibrary(
			sonarrClient,
			mappingService,
			manualMappingService,
			anibridgeMappingStore,
			providerLibraryCaches.sonarr,
			() => bumpLibraryRevision("sonarr"),
		),
	);

	const radarrLibrary = bindAll(
		new RadarrLibrary(
			radarrClient,
			mappingService,
			manualMappingService,
			anibridgeMappingStore,
			providerLibraryCaches.radarr,
			() => bumpLibraryRevision("radarr"),
		),
	);

	const providerNotConfiguredError = (provider: Provider) => {
		const label = getProviderLabel(provider);
		const code =
			provider === "sonarr"
				? ErrorCode.SONARR_NOT_CONFIGURED
				: ErrorCode.CONFIGURATION_ERROR;
		return createError(
			code,
			`${label} credentials are not configured.`,
			`Configure your ${label} connection in ani2arr options.`,
		);
	};

	const ensureProviderConfigured = async (
		provider: Provider,
	): Promise<{
		credentials: ProviderCredentials;
		options: ExtensionOptions;
	}> => {
		const options = await getExtensionOptionsSnapshot();
		const credentials = getProviderCredentials(options, provider);
		if (!credentials) throw providerNotConfiguredError(provider);
		return { credentials, options };
	};

	const ensureSonarrConfigured = async (): Promise<{
		credentials: ProviderCredentials;
		options: ExtensionOptions;
	}> => {
		return ensureProviderConfigured("sonarr");
	};

	const ensureRadarrConfigured = async (): Promise<{
		credentials: ProviderCredentials;
		options: ExtensionOptions;
	}> => {
		return ensureProviderConfigured("radarr");
	};

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
					await sonarrLibrary.refreshCache(options);
					return;
				}

				await radarrLibrary.refreshCache(options);
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

		for (const provider of changedProviders) {
			clearProviderClientCache(provider);
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
		sonarrClient.clearEtagCache();
		radarrClient.clearEtagCache();

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
		const removals = [
			{ provider: "sonarr" as const, url: options.providers.sonarr.url },
			{ provider: "radarr" as const, url: options.providers.radarr.url },
		];

		await Promise.all(
			removals.map(async ({ provider, url }) => {
				if (!url) return;

				const removal = await removeProviderHostPermission(String(url));
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
		SonarrClient: sonarrClient,
		RadarrClient: radarrClient,
		anilistMediaService,
		mappingService,
		manualMappingService,
		autoMappingStore,
		anibridgeMappingStore,
		sonarrLibrary,
		radarrLibrary,
		anilistMetadataStore,
		manualMappingsReady,
		ensureSonarrConfigured,
		ensureRadarrConfigured,
		scheduleLibraryRefresh,
		bumpLibraryRevision,
		bumpMappingsRevision,
		handleProviderConnectionChanged,
		clearPersistentCaches,
		resetExtensionState,
	};
};
