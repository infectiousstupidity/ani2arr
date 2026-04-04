/** Runtime-owned composition for the background Ani2arr API implementation. */
// src/runtime/create-background-api.ts

import {
  anilistMediaCache,
  bumpRevision,
  clearAllTtlCaches,
  radarrLookupCaches,
  resetAllRevisions,
  sonarrLookupCaches,
  upstreamMappingCaches,
} from '@/storage';
import { providerLibraryCaches } from '@/providers/library/cache';
import { SonarrClient } from '@/providers/clients/sonarr.client';
import { RadarrClient } from '@/providers/clients/radarr.client';
import {
  hasProviderHostPermission,
  removeProviderHostPermission,
} from '@/providers/permissions/host-permissions';
import { AniListMediaService, AniListMetadataStore } from '@/core/anilist';
import { RadarrLibrary } from '@/providers/library/radarr-library';
import { SonarrLibrary } from '@/providers/library/sonarr-library';
import { MappingService } from '@/services/mapping';
import { MappingOverridesService } from '@/services/mapping/overrides';
import { UpstreamMappingStore } from '@/services/mapping/upstream';
import { SonarrLookupClient, RadarrLookupClient } from '@/services/mapping/lookup';
import { getMappingsHandler } from '@/rpc/handlers/get-mappings.handlers';
import { createApiHandlers } from '@/rpc/handlers';
import {
  createDefaultSettings,
  getExtensionOptionsSnapshot,
  setExtensionOptionsSnapshot,
  type ExtensionOptions,
} from '@/options';
import type { Provider, ProviderCredentials } from '@/providers';
import { createError, ErrorCode, logError, normalizeError } from '@/shared/errors';
import type { Ani2arrApi } from '@/rpc';
import { logger } from '@/shared/utils/logger';

const DEBOUNCED_LIBRARY_REFRESH_MS = 45 * 1000;

const bumpMappingsRevision = async (): Promise<void> => {
  await bumpRevision('mappings');
};

function bindAll<T extends object>(instance: T): T {
  const proto = Object.getPrototypeOf(instance) as Record<string, unknown> | null;
  if (!proto) return instance;

  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (descriptor && typeof descriptor.value === 'function') {
      const fn = descriptor.value as (...args: unknown[]) => unknown;
      Object.defineProperty(instance, key, {
        ...descriptor,
        value: fn.bind(instance),
      });
    }
  }

  return instance;
}

export const createBackgroundApi = (): Ani2arrApi => {
  const createHasUrlPermission =
    (provider: Provider) =>
    async (url: string): Promise<boolean> => {
      const result = await hasProviderHostPermission(url);
      if (!result.ok) {
        logError(normalizeError(result.error), `Ani2arrApi:${provider}:hasUrlPermission`);
        return false;
      }

      return result.value;
    };

  const sonarrClient = bindAll(new SonarrClient({ hasUrlPermission: createHasUrlPermission('sonarr') }));
  const radarrClient = bindAll(new RadarrClient({ hasUrlPermission: createHasUrlPermission('radarr') }));

  const anilistMediaService = bindAll(
    new AniListMediaService({
      media: anilistMediaCache,
    }),
  );

  const upstreamMappingStore = new UpstreamMappingStore(upstreamMappingCaches);

  const lookupClient = new SonarrLookupClient(sonarrClient, sonarrLookupCaches);

  const radarrLookupClient = new RadarrLookupClient(radarrClient, radarrLookupCaches);

  const overridesService = new MappingOverridesService();
  const overridesReady = overridesService.init();

  const mappingService = bindAll(
    new MappingService(
      anilistMediaService,
      upstreamMappingStore,
      {
        sonarr: lookupClient,
        radarr: radarrLookupClient,
      },
      overridesService,
      () => {
        void bumpMappingsRevision();
      },
    ),
  );

  const anilistMetadataStore = new AniListMetadataStore(anilistMediaService);

  void getExtensionOptionsSnapshot()
    .then(options => {
      logger.configure({ enabled: (options?.debugLogging ?? false) || import.meta.env.DEV });
    })
    .catch(() => {});

  const pendingLibraryRefresh: Record<Provider, ReturnType<typeof setTimeout> | null> = {
    sonarr: null,
    radarr: null,
  };

  const refreshOptionsHint: Record<Provider, ExtensionOptions | null> = {
    sonarr: null,
    radarr: null,
  };

  const bumpLibraryRevision = async (
    provider: Provider,
  ): Promise<void> => {
    await bumpRevision(
      provider === 'sonarr' ? 'sonarrLibrary' : 'radarrLibrary',
    );
  };

  const sonarrLibrary = bindAll(
    new SonarrLibrary(
      sonarrClient,
      mappingService,
      providerLibraryCaches.sonarr,
      () => bumpLibraryRevision('sonarr'),
    ),
  );

  const radarrLibrary = bindAll(
    new RadarrLibrary(
      radarrClient,
      mappingService,
      providerLibraryCaches.radarr,
      () => bumpLibraryRevision('radarr'),
    ),
  );

  const ensureSonarrConfigured = async (): Promise<{
    credentials: ProviderCredentials;
    options: ExtensionOptions;
  }> => {
    const options = await getExtensionOptionsSnapshot();
    if (!options?.providers.sonarr.url || !options?.providers.sonarr.apiKey) {
      throw createError(
        ErrorCode.SONARR_NOT_CONFIGURED,
        'Sonarr credentials are not configured.',
        'Configure your Sonarr connection in ani2arr options.',
      );
    }

    return {
      credentials: {
        url: options.providers.sonarr.url,
        apiKey: options.providers.sonarr.apiKey,
      },
      options,
    };
  };

  const ensureRadarrConfigured = async (): Promise<{
    credentials: ProviderCredentials;
    options: ExtensionOptions;
  }> => {
    const options = await getExtensionOptionsSnapshot();
    if (!options?.providers.radarr.url || !options?.providers.radarr.apiKey) {
      throw createError(
        ErrorCode.CONFIGURATION_ERROR,
        'Radarr credentials are not configured.',
        'Configure your Radarr connection in ani2arr options.',
      );
    }

    return {
      credentials: {
        url: options.providers.radarr.url,
        apiKey: options.providers.radarr.apiKey,
      },
      options,
    };
  };

  const scheduleLibraryRefresh = (provider: Provider, optionsHint?: ExtensionOptions): void => {
    if (optionsHint) {
      refreshOptionsHint[provider] = optionsHint;
    }

    if (pendingLibraryRefresh[provider] !== null) return;

    pendingLibraryRefresh[provider] = globalThis.setTimeout(async () => {
      pendingLibraryRefresh[provider] = null;

      try {
        const options = refreshOptionsHint[provider] ?? (await getExtensionOptionsSnapshot());
        refreshOptionsHint[provider] = null;

        if (provider === 'sonarr') {
          if (!options?.providers.sonarr.url || !options?.providers.sonarr.apiKey) return;
          await sonarrLibrary.refreshCache(options);
          return;
        }

        if (!options?.providers.radarr.url || !options?.providers.radarr.apiKey) return;
        await radarrLibrary.refreshCache(options);
      } catch (error) {
        logError(normalizeError(error), `Ani2arrApi:debouncedLibraryRefresh:${provider}`);
      }
    }, DEBOUNCED_LIBRARY_REFRESH_MS);
  };

  const handleOptionsUpdated = async (optionsHint?: ExtensionOptions): Promise<void> => {
    sonarrClient.clearEtagCache();
    radarrClient.clearEtagCache();
    logger.configure({ enabled: (optionsHint?.debugLogging ?? false) || import.meta.env.DEV });

    await mappingService.resetLookupState();
    await bumpMappingsRevision();

    const options = optionsHint ?? (await getExtensionOptionsSnapshot());
    const hasConfiguredProvider = Boolean(
      (options?.providers.sonarr.url && options.providers.sonarr.apiKey) ||
      (options?.providers.radarr.url && options.providers.radarr.apiKey),
    );

    if (hasConfiguredProvider) {
      await mappingService.initStaticPairs();
    }

    await Promise.all([
      sonarrLibrary.refreshCache(options),
      radarrLibrary.refreshCache(options),
    ]);

    await Promise.all([
      bumpLibraryRevision('sonarr'),
      bumpLibraryRevision('radarr'),
    ]);
  };

  const clearPersistentCaches = async (): Promise<void> => {
    sonarrClient.clearEtagCache();
    radarrClient.clearEtagCache();

    await Promise.all([
      anilistMetadataStore.clearLocalCache(),
      mappingService.resetLookupState(),
      upstreamMappingStore.clear(),
    ]);

    await clearAllTtlCaches();
    await resetAllRevisions();
  };

  const removeConfiguredProviderHostPermissions = async (options: ExtensionOptions): Promise<void> => {
    const removals = [
      { provider: 'sonarr' as const, url: options.providers.sonarr.url },
      { provider: 'radarr' as const, url: options.providers.radarr.url },
    ];

    await Promise.all(removals.map(async ({ provider, url }) => {
      if (!url) return;

      const removal = await removeProviderHostPermission(String(url));
      if (!removal.ok) {
        logError(normalizeError(removal.error), `Ani2arrApi:resetExtensionState:${provider}:removePermission`);
        return;
      }

      if (!removal.value.removed) {
        logError(
          normalizeError(new Error(`Permission removal rejected for ${removal.value.pattern}.`)),
          `Ani2arrApi:resetExtensionState:${provider}:removePermission`,
        );
      }
    }));
  };

  const resetExtensionState = async (): Promise<void> => {
    await overridesReady;

    const previousOptions = await getExtensionOptionsSnapshot();
    const defaults = createDefaultSettings();

    await overridesService.clearAll();
    await clearPersistentCaches();
    await setExtensionOptionsSnapshot(defaults);
    await removeConfiguredProviderHostPermissions(previousOptions);
  };

  return createApiHandlers({
    SonarrClient: sonarrClient,
    RadarrClient: radarrClient,
    anilistMediaService,
    mappingService,
    overridesService,
    upstreamMappingStore,
    sonarrLibrary,
    radarrLibrary,
    anilistMetadataStore,
    overridesReady,
    ensureSonarrConfigured,
    ensureRadarrConfigured,
    scheduleLibraryRefresh,
    bumpLibraryRevision,
    bumpMappingsRevision,
    handleOptionsUpdated,
    clearPersistentCaches,
    resetExtensionState,
    getMappings: getMappingsHandler,
  });
};
