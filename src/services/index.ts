import { browser } from 'wxt/browser';
import { createTtlCache, getExtensionOptionsSnapshot } from '@/lib/storage';
import { CACHE_NAMESPACES, REVISION_KEYS } from '@/lib/storage/keys';
import { SonarrApiService,  } from '@/clients/sonarr.api';
import { RadarrApiService } from '@/clients/radarr.api';
import { AnilistApiService } from '@/clients/anilist.api';
import { MappingService, type ResolvedMapping, type StaticMappingPayload } from './mapping';
import { MappingOverridesService } from './mapping/overrides';
import { StaticMappingProvider } from './mapping/static';
import { SonarrLookupClient, RadarrLookupClient } from './mapping/lookup';
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
import { createError, ErrorCode, logError, normalizeError } from '@/shared/errors/error-utils';
import type { Ani2arrApi } from '@/rpc';
import { logger } from '@/shared/utils/logger';

const DEBOUNCED_LIBRARY_REFRESH_MS = 45 * 1000;
const CONTENT_SCRIPT_URL_PATTERNS = [
  '*://anilist.co/*',
  '*://www.anilist.co/*',
  '*://anichart.net/*',
  '*://www.anichart.net/*',
];

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

const initializeRevision = async (
  key: typeof REVISION_KEYS[keyof typeof REVISION_KEYS],
): Promise<number> => {
  try {
    const stored = await browser.storage.local.get(key);
    const value = stored[key];
    if (typeof value === 'number') return value;
  } catch (error) {
    logError(normalizeError(error), `Ani2arrApi:initRevision:${key}`);
  }

  return 0;
};

export const createApiImplementation = (): Ani2arrApi => {
  const sonarrApiService = bindAll(new SonarrApiService());
  const radarrApiService = bindAll(new RadarrApiService());

  const anilistApiService = bindAll(
    new AnilistApiService({
      media: createTtlCache<AniMedia>(CACHE_NAMESPACES.anilistMedia),
    }),
  );

  const staticProvider = new StaticMappingProvider({
    primary: createTtlCache<StaticMappingPayload>(CACHE_NAMESPACES.mappingStaticPrimary),
    fallback: createTtlCache<StaticMappingPayload>(CACHE_NAMESPACES.mappingStaticFallback),
  });

  const lookupClient = new SonarrLookupClient(sonarrApiService, {
    positive: createTtlCache<SonarrLookupSeries[]>(CACHE_NAMESPACES.mappingLookupPositiveSonarr),
    negative: createTtlCache<boolean>(CACHE_NAMESPACES.mappingLookupNegativeSonarr),
  });

  const radarrLookupClient = new RadarrLookupClient(radarrApiService, {
    positive: createTtlCache<RadarrLookupMovie[]>(CACHE_NAMESPACES.mappingLookupPositiveRadarr),
    negative: createTtlCache<boolean>(CACHE_NAMESPACES.mappingLookupNegativeRadarr),
  });

  const overridesService = new MappingOverridesService();
  const overridesReady = overridesService.init();

  let mappingsRevision = 0;

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

  const bumpMappingsRevision = async (payload?: Record<string, unknown>): Promise<void> => {
    mappingsRevision += 1;
    const nextRevision = mappingsRevision;
    await browser.storage.local.set({ [REVISION_KEYS.mappings]: nextRevision });
    await broadcast('mappings-updated', { epoch: nextRevision, ...payload });
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
          success: createTtlCache<ResolvedMapping>(CACHE_NAMESPACES.mappingResolvedSuccessSonarr),
          failure: createTtlCache<ExtensionError>(CACHE_NAMESPACES.mappingResolvedFailureSonarr),
        },
        radarr: {
          success: createTtlCache<ResolvedMapping>(CACHE_NAMESPACES.mappingResolvedSuccessRadarr),
          failure: createTtlCache<ExtensionError>(CACHE_NAMESPACES.mappingResolvedFailureRadarr),
        },
      },
      overridesService,
      () => {
        void bumpMappingsRevision();
      },
    ),
  );

  const anilistMetadataStore = new AniListMetadataStore(anilistApiService);

  const libraryRevision: Record<LibraryProvider, number> = {
    sonarr: 0,
    radarr: 0,
  };

  let settingsRevision = 0;

  void getExtensionOptionsSnapshot()
    .then(options => {
      logger.configure({ enabled: (options?.debugLogging ?? false) || import.meta.env.DEV });
    })
    .catch(() => {});

  void initializeRevision(REVISION_KEYS.sonarrLibrary).then(revision => {
    libraryRevision.sonarr = revision;
  });

  void initializeRevision(REVISION_KEYS.radarrLibrary).then(revision => {
    libraryRevision.radarr = revision;
  });

  void initializeRevision(REVISION_KEYS.settings).then(revision => {
    settingsRevision = revision;
  });

  void initializeRevision(REVISION_KEYS.mappings).then(revision => {
    mappingsRevision = revision;
  });

  const pendingLibraryRefresh: Record<LibraryProvider, ReturnType<typeof setTimeout> | null> = {
    sonarr: null,
    radarr: null,
  };

  const refreshOptionsHint: Record<LibraryProvider, ExtensionOptions | null> = {
    sonarr: null,
    radarr: null,
  };

  const bumpLibraryRevision = async (
    provider: LibraryProvider,
    payload?: Record<string, unknown>,
  ): Promise<void> => {
    libraryRevision[provider] += 1;
    const nextRevision = libraryRevision[provider];
    const storageKey =
      provider === 'sonarr' ? REVISION_KEYS.sonarrLibrary : REVISION_KEYS.radarrLibrary;

    await browser.storage.local.set({ [storageKey]: nextRevision });
    await broadcast('series-updated', { provider, epoch: nextRevision, ...payload });
  };

  const sonarrLibrary = bindAll(
    new SonarrLibrary(
      sonarrApiService,
      mappingService,
      { lean: createTtlCache<LeanSonarrSeries[]>(CACHE_NAMESPACES.libraryLeanSonarr) },
      mutation => bumpLibraryRevision('sonarr', { tvdbId: mutation.tvdbId, action: mutation.action }),
    ),
  );

  const radarrLibrary = bindAll(
    new RadarrLibrary(
      radarrApiService,
      mappingService,
      { lean: createTtlCache<LeanRadarrMovie[]>(CACHE_NAMESPACES.libraryLeanRadarr) },
      mutation => bumpLibraryRevision('radarr', { tmdbId: mutation.tmdbId, action: mutation.action }),
    ),
  );

  const bumpSettingsRevision = async (): Promise<void> => {
    settingsRevision += 1;
    const nextRevision = settingsRevision;
    await browser.storage.local.set({ [REVISION_KEYS.settings]: nextRevision });
    await broadcast('settings-changed', { epoch: nextRevision });
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
      credentials: {
        url: options.providers.sonarr.url,
        apiKey: options.providers.sonarr.apiKey,
      },
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
      credentials: {
        url: options.providers.radarr.url,
        apiKey: options.providers.radarr.apiKey,
      },
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

    await bumpSettingsRevision();
    await mappingService.resetLookupState();
    await bumpMappingsRevision({ action: 'reset-lookup-state' });

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
    bumpLibraryRevision,
    bumpMappingsRevision,
    handleOptionsUpdated,
    getMappings: getMappingsHandler,
    updateMovie: updateRadarrMovieHandler,
    updateSeries: updateSonarrSeriesHandler,
  });
};
