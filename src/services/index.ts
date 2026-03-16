import { browser } from 'wxt/browser';
import { createTtlCache } from '@/cache';
import { CacheNamespaces } from '@/cache/namespaces';
import { SonarrApiService } from '@/clients/sonarr.api';
import { RadarrApiService } from '@/clients/radarr.api';
import { AnilistApiService } from '@/clients/anilist.api';
import { MappingService, type ResolvedMapping, type StaticMappingPayload } from './mapping';
import { MappingOverridesService } from './mapping/overrides.service';
import { StaticMappingProvider } from './mapping/static-mapping.provider';
import { SonarrLookupClient } from './mapping/sonarr-lookup.client';
import { RadarrLookupClient } from './mapping/radarr-lookup.client';
import { SonarrLibrary } from '@/services/library/sonarr';
import { RadarrLibrary } from '@/services/library/radarr';
import { AniListMetadataStore } from './anilist';
import { getMappingsHandler } from '@/rpc/handlers/get-mappings';
import { updateRadarrMovieHandler } from '@/rpc/handlers/update-movie';
import { updateSonarrSeriesHandler } from '@/rpc/handlers/update-series';
import { createApiHandlers } from '@/rpc/handlers/handlers';

import type {
  AniMedia,
  ExtensionError,
  ExtensionOptions,
  LeanRadarrMovie,
  LeanSonarrSeries,
  RadarrCredentialsPayload,
  RadarrLookupMovie,
  SonarrCredentialsPayload,
  SonarrLookupSeries,
} from '@/shared/types';
import { getExtensionOptionsSnapshot } from '@/shared/options/storage';
import { createError, ErrorCode, logError, normalizeError } from '@/shared/errors/error-utils';
import { type Ani2arrApi } from '@/rpc';
import { logger } from '@/shared/utils/logger';

const DEBOUNCED_LIBRARY_REFRESH_MS = 45 * 1000;
const CONTENT_SCRIPT_URL_PATTERNS = ['*://anilist.co/*', '*://www.anilist.co/*', '*://anichart.net/*', '*://www.anichart.net/*'];
type LibraryProvider = 'sonarr' | 'radarr';

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

const initializeEpoch = async (
  key: 'libraryEpochSonarr' | 'libraryEpochRadarr' | 'settingsEpoch' | 'mappingsEpoch',
): Promise<number> => {
  try {
    const stored = await browser.storage.local.get(key);
    const value = stored[key];
    if (typeof value === 'number') return value;
  } catch (error) {
    logError(normalizeError(error), `Ani2arrApi:initEpoch:${key}`);
  }
  return 0;
};

export const createApiImplementation = (): Ani2arrApi => {
  const sonarrApiService = bindAll(new SonarrApiService());
  const radarrApiService = bindAll(new RadarrApiService());
  const anilistApiService = bindAll(
    new AnilistApiService({
      media: createTtlCache<AniMedia>(CacheNamespaces.anilistMedia),
    }),
  );

  const staticProvider = new StaticMappingProvider({
    primary: createTtlCache<StaticMappingPayload>(CacheNamespaces.mappingStaticPrimary),
    fallback: createTtlCache<StaticMappingPayload>(CacheNamespaces.mappingStaticFallback),
  });

  const lookupClient = new SonarrLookupClient(sonarrApiService, {
    positive: createTtlCache<SonarrLookupSeries[]>(CacheNamespaces.mappingLookupPositiveSonarr),
    negative: createTtlCache<boolean>(CacheNamespaces.mappingLookupNegativeSonarr),
  });

  const radarrLookupClient = new RadarrLookupClient(radarrApiService, {
    positive: createTtlCache<RadarrLookupMovie[]>(CacheNamespaces.mappingLookupPositiveRadarr),
    negative: createTtlCache<boolean>(CacheNamespaces.mappingLookupNegativeRadarr),
  });

  const overridesService = new MappingOverridesService();
  const overridesReady = overridesService.init();
  let mappingsEpoch = 0;

  const bumpMappingsEpoch = async (payload?: Record<string, unknown>): Promise<void> => {
    mappingsEpoch += 1;
    const nextEpoch = mappingsEpoch;
    await browser.storage.local.set({ mappingsEpoch: nextEpoch });
    await broadcast('mappings-updated', { epoch: nextEpoch, ...payload });
  };

  const mappingService = bindAll(
    new MappingService(
      anilistApiService,
      staticProvider,
      {
        sonarr: lookupClient,
        radarr: radarrLookupClient,
      },
      {
        sonarr: {
          success: createTtlCache<ResolvedMapping>(CacheNamespaces.mappingResolvedSuccessSonarr),
          failure: createTtlCache<ExtensionError>(CacheNamespaces.mappingResolvedFailureSonarr),
        },
        radarr: {
          success: createTtlCache<ResolvedMapping>(CacheNamespaces.mappingResolvedSuccessRadarr),
          failure: createTtlCache<ExtensionError>(CacheNamespaces.mappingResolvedFailureRadarr),
        },
      },
      overridesService,
      () => {
        void bumpMappingsEpoch();
      },
    ),
  );

  const anilistMetadataStore = new AniListMetadataStore(anilistApiService);

  const libraryEpoch: Record<LibraryProvider, number> = {
    sonarr: 0,
    radarr: 0,
  };
  let settingsEpoch = 0;

  void getExtensionOptionsSnapshot()
    .then(options => {
      logger.configure({ enabled: (options?.debugLogging ?? false) || import.meta.env.DEV });
    })
    .catch(() => {});

  void initializeEpoch('libraryEpochSonarr').then(epoch => {
    libraryEpoch.sonarr = epoch;
  });
  void initializeEpoch('libraryEpochRadarr').then(epoch => {
    libraryEpoch.radarr = epoch;
  });
  void initializeEpoch('settingsEpoch').then(epoch => {
    settingsEpoch = epoch;
  });
  void initializeEpoch('mappingsEpoch').then(epoch => {
    mappingsEpoch = epoch;
  });

  const pendingLibraryRefresh: Record<LibraryProvider, ReturnType<typeof setTimeout> | null> = {
    sonarr: null,
    radarr: null,
  };
  const refreshOptionsHint: Record<LibraryProvider, ExtensionOptions | null> = {
    sonarr: null,
    radarr: null,
  };

  const broadcast = async (topic: string, payload?: Record<string, unknown>): Promise<void> => {
    const message = { _a2a: true, topic, payload };

    try {
      await browser.runtime.sendMessage(message);
    } catch (error) {
      const normalized = normalizeError(error);
      if (normalized.message.includes('Receiving end does not exist')) return;
      logError(normalized, `Ani2arrApi:broadcast:${topic}`);
    }
    try {
      const tabs = await browser.tabs.query({ url: CONTENT_SCRIPT_URL_PATTERNS });
      await Promise.all(
        tabs.map(async tab => {
          if (typeof tab.id !== 'number') return;
          try {
            await browser.tabs.sendMessage(tab.id, message);
          } catch (error) {
            const normalized = normalizeError(error);
            if (normalized.message.includes('Receiving end does not exist')) return;
            logError(normalized, `Ani2arrApi:broadcast:tab:${topic}`);
          }
        }),
      );
    } catch (error) {
      logError(normalizeError(error), `Ani2arrApi:broadcast:tabsQuery:${topic}`);
    }
  };

  const bumpLibraryEpoch = async (provider: LibraryProvider, payload?: Record<string, unknown>): Promise<void> => {
    libraryEpoch[provider] += 1;
    const nextEpoch = libraryEpoch[provider];
    const storageKey = provider === 'sonarr' ? 'libraryEpochSonarr' : 'libraryEpochRadarr';
    await browser.storage.local.set({ [storageKey]: nextEpoch });
    await broadcast('series-updated', { provider, epoch: nextEpoch, ...payload });
  };

  const sonarrLibrary = bindAll(
    new SonarrLibrary(
      sonarrApiService,
      mappingService,
      { lean: createTtlCache<LeanSonarrSeries[]>(CacheNamespaces.libraryLeanSonarr) },
      mutation => bumpLibraryEpoch('sonarr', { tvdbId: mutation.tvdbId, action: mutation.action }),
    ),
  );
  const radarrLibrary = bindAll(
    new RadarrLibrary(
      radarrApiService,
      mappingService,
      { lean: createTtlCache<LeanRadarrMovie[]>(CacheNamespaces.libraryLeanRadarr) },
      mutation => bumpLibraryEpoch('radarr', { tmdbId: mutation.tmdbId, action: mutation.action }),
    ),
  );

  const bumpSettingsEpoch = async (): Promise<void> => {
    settingsEpoch += 1;
    const nextEpoch = settingsEpoch;
    await browser.storage.local.set({ settingsEpoch: nextEpoch });
    await broadcast('settings-changed', { epoch: nextEpoch });
  };

  const ensureSonarrConfigured = async (): Promise<{
    credentials: SonarrCredentialsPayload;
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
      credentials: { url: options.providers.sonarr.url, apiKey: options.providers.sonarr.apiKey },
      options,
    };
  };

  const ensureRadarrConfigured = async (): Promise<{
    credentials: RadarrCredentialsPayload;
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
      credentials: { url: options.providers.radarr.url, apiKey: options.providers.radarr.apiKey },
      options,
    };
  };

  const scheduleLibraryRefresh = (provider: LibraryProvider, optionsHint?: ExtensionOptions): void => {
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
    sonarrApiService.clearEtagCache();
    radarrApiService.clearEtagCache();
    logger.configure({ enabled: (optionsHint?.debugLogging ?? false) || import.meta.env.DEV });
    await bumpSettingsEpoch();
    await mappingService.resetLookupState();
    await bumpMappingsEpoch({ action: 'reset-lookup-state' });
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
      bumpLibraryEpoch('sonarr'),
      bumpLibraryEpoch('radarr'),
    ]);
  };

  return createApiHandlers({
    sonarrApiService,
    radarrApiService,
    anilistApiService,
    mappingService,
    overridesService,
    staticProvider,
    sonarrLibrary,
    radarrLibrary,
    anilistMetadataStore,
    overridesReady,
    ensureSonarrConfigured,
    ensureRadarrConfigured,
    scheduleLibraryRefresh,
    bumpLibraryEpoch,
    bumpMappingsEpoch,
    handleOptionsUpdated,
    getMappings: getMappingsHandler,
    updateMovie: updateRadarrMovieHandler,
    updateSeries: updateSonarrSeriesHandler,
  });
};
