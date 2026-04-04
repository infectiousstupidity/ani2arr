/** Background API dependency assembly for the Ani2arr RPC implementation. */
// src/background/api/create-api-deps.ts

import { bumpRevision, clearAllTtlCaches, resetAllRevisions } from '@/storage';
import { radarrLookupCaches, sonarrLookupCaches } from '@/mapping/lookup/lookup.cache';
import { upstreamMappingCaches } from '@/mapping/upstream/upstream-mapping.cache';
import { anilistMediaCache } from '@/anilist/media.cache';
import { providerLibraryCaches } from '@/providers/library/cache';
import { SonarrClient } from '@/providers/clients/sonarr.client';
import { RadarrClient } from '@/providers/clients/radarr.client';
import {
  hasProviderHostPermission,
  removeProviderHostPermission,
} from '@/providers/permissions/host-permissions';
import { AniListMediaService, AniListMetadataStore } from '@/anilist';
import { RadarrLibrary } from '@/providers/library/radarr-library';
import { SonarrLibrary } from '@/providers/library/sonarr-library';
import { MappingService } from '@/mapping/mapping.service';
import { MappingOverridesService } from '@/mapping/overrides';
import { UpstreamMappingStore } from '@/mapping/upstream';
import { SonarrLookupClient, RadarrLookupClient } from '@/mapping/lookup';
import {
  createDefaultSettings,
  getExtensionOptionsSnapshot,
  setExtensionOptionsSnapshot,
  getProviderCredentials,
  isProviderConfigured,
  type ExtensionOptions,
} from '@/options';
import type { Provider, ProviderCredentials } from '@/providers';
import { createError, ErrorCode, logError, normalizeError } from '@/shared/errors';
import type { ApiHandlerDeps } from '@/rpc/handlers/handler-deps';
import { logger } from '@/shared/utils/logger';

const DEBOUNCED_LIBRARY_REFRESH_MS = 45 * 1000;

const bumpMappingsRevision = async (): Promise<void> => {
  await bumpRevision('mappings');
};

const bindAll = <T extends object>(instance: T): T => {
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
};

export const createApiDeps = (): ApiHandlerDeps => {
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

  const bumpLibraryRevision = async (provider: Provider): Promise<void> => {
    await bumpRevision(provider === 'sonarr' ? 'sonarrLibrary' : 'radarrLibrary');
  };

  const sonarrLibrary = bindAll(
    new SonarrLibrary(
      sonarrClient,
      mappingService,
      overridesService,
      upstreamMappingStore,
      providerLibraryCaches.sonarr,
      () => bumpLibraryRevision('sonarr'),
    ),
  );

  const radarrLibrary = bindAll(
    new RadarrLibrary(
      radarrClient,
      mappingService,
      overridesService,
      providerLibraryCaches.radarr,
      () => bumpLibraryRevision('radarr'),
    ),
  );

  const providerNotConfiguredError = (provider: Provider) => {
    const label = provider === 'sonarr' ? 'Sonarr' : 'Radarr';
    const code = provider === 'sonarr' ? ErrorCode.SONARR_NOT_CONFIGURED : ErrorCode.CONFIGURATION_ERROR;
    return createError(
      code,
      `${label} credentials are not configured.`,
      `Configure your ${label} connection in ani2arr options.`,
    );
  };

  const ensureProviderConfigured = async (provider: Provider): Promise<{
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
    return ensureProviderConfigured('sonarr');
  };

  const ensureRadarrConfigured = async (): Promise<{
    credentials: ProviderCredentials;
    options: ExtensionOptions;
  }> => {
    return ensureProviderConfigured('radarr');
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

        if (!isProviderConfigured(options, provider)) return;

        if (provider === 'sonarr') {
          await sonarrLibrary.refreshCache(options);
          return;
        }

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
    const hasConfiguredProvider = isProviderConfigured(options, 'sonarr') || isProviderConfigured(options, 'radarr');

    if (hasConfiguredProvider) {
      await mappingService.initStaticPairs();
    }

    await Promise.all([sonarrLibrary.refreshCache(options), radarrLibrary.refreshCache(options)]);

    await Promise.all([bumpLibraryRevision('sonarr'), bumpLibraryRevision('radarr')]);
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

    await Promise.all(
      removals.map(async ({ provider, url }) => {
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
      }),
    );
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

  return {
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
  };
};
