import { browser } from 'wxt/browser';
import { createTtlCache } from '@/cache';
import { CacheNamespaces } from '@/cache/namespaces';
import { SonarrApiService } from '@/clients/sonarr.api';
import { AnilistApiService } from '@/clients/anilist.api';
import { MappingService, type ResolvedMapping, type StaticMappingPayload } from './mapping';
import { MappingOverridesService } from './mapping/overrides.service';
import { StaticMappingProvider } from './mapping/static-mapping.provider';
import { SonarrLookupClient } from './mapping/sonarr-lookup.client';
import { SonarrLibrary } from '@/services/library/sonarr';
import { AniListMetadataStore } from './anilist';
import { getMappingsHandler } from '@/rpc/handlers/get-mappings';
import { updateSonarrSeriesHandler } from '@/rpc/handlers/update-series';
import { createApiHandlers } from '@/rpc/handlers/handlers';

import type { LeanSonarrSeries, SonarrLookupSeries, ExtensionOptions, AniMedia, ExtensionError } from '@/shared/types';
import { getExtensionOptionsSnapshot } from '@/shared/options/storage';
import { createError, ErrorCode, logError, normalizeError } from '@/shared/errors/error-utils';
import { type Ani2arrApi } from '@/rpc';
import { logger } from '@/shared/utils/logger';

const DEBOUNCED_LIBRARY_REFRESH_MS = 45 * 1000;
const CONTENT_SCRIPT_URL_PATTERNS = ['*://anilist.co/*', '*://www.anilist.co/*', '*://anichart.net/*', '*://www.anichart.net/*'];

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

const initializeEpoch = async (key: 'libraryEpoch' | 'settingsEpoch'): Promise<number> => {
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
    positive: createTtlCache<SonarrLookupSeries[]>(CacheNamespaces.mappingLookupPositive),
    negative: createTtlCache<boolean>(CacheNamespaces.mappingLookupNegative),
  });

  const overridesService = new MappingOverridesService();
  const overridesReady = overridesService.init();

  const mappingService = bindAll(
    new MappingService(
      anilistApiService,
      staticProvider,
      lookupClient,
      {
        success: createTtlCache<ResolvedMapping>(CacheNamespaces.mappingResolvedSuccess),
        failure: createTtlCache<ExtensionError>(CacheNamespaces.mappingResolvedFailure),
      },
      overridesService,
    ),
  );

  const anilistMetadataStore = new AniListMetadataStore(anilistApiService);

  let libraryEpoch = 0;
  let settingsEpoch = 0;

  void getExtensionOptionsSnapshot()
    .then(options => {
      logger.configure({ enabled: (options?.debugLogging ?? false) || import.meta.env.DEV });
    })
    .catch(() => {});

  void initializeEpoch('libraryEpoch').then(epoch => {
    libraryEpoch = epoch;
  });
  void initializeEpoch('settingsEpoch').then(epoch => {
    settingsEpoch = epoch;
  });

  let pendingLibraryRefresh: ReturnType<typeof setTimeout> | null = null;
  let refreshOptionsHint: ExtensionOptions | null = null;

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

  const bumpLibraryEpoch = async (payload?: Record<string, unknown>): Promise<void> => {
    libraryEpoch += 1;
    const nextEpoch = libraryEpoch;
    await browser.storage.local.set({ libraryEpoch: nextEpoch });
    await broadcast('series-updated', { epoch: nextEpoch, ...payload });
  };

  const sonarrLibrary = bindAll(
    new SonarrLibrary(
      sonarrApiService,
      mappingService,
      { leanSeries: createTtlCache<LeanSonarrSeries[]>(CacheNamespaces.libraryLean) },
      mutation => bumpLibraryEpoch({ tvdbId: mutation.tvdbId, action: mutation.action }),
    ),
  );

  const bumpSettingsEpoch = async (): Promise<void> => {
    settingsEpoch += 1;
    const nextEpoch = settingsEpoch;
    await browser.storage.local.set({ settingsEpoch: nextEpoch });
    await broadcast('settings-changed', { epoch: nextEpoch });
  };

  const ensureConfigured = async (): Promise<{ credentials: { url: string; apiKey: string }; options: ExtensionOptions }> => {
    const options = await getExtensionOptionsSnapshot();
    if (!options?.sonarrUrl || !options?.sonarrApiKey) {
      throw createError(
        ErrorCode.SONARR_NOT_CONFIGURED,
        'Sonarr credentials are not configured.',
        'Configure your Sonarr connection in ani2arr options.',
      );
    }
    return {
      credentials: { url: options.sonarrUrl, apiKey: options.sonarrApiKey },
      options,
    };
  };

  const scheduleLibraryRefresh = (optionsHint?: ExtensionOptions): void => {
    if (optionsHint) {
      refreshOptionsHint = optionsHint;
    }
    if (pendingLibraryRefresh !== null) return;
    pendingLibraryRefresh = globalThis.setTimeout(async () => {
      pendingLibraryRefresh = null;
      try {
        const options = refreshOptionsHint ?? (await getExtensionOptionsSnapshot());
        if (!options?.sonarrUrl || !options?.sonarrApiKey) return;
        await sonarrLibrary.refreshCache(options);
      } catch (error) {
        logError(normalizeError(error), 'Ani2arrApi:debouncedLibraryRefresh');
      }
    }, DEBOUNCED_LIBRARY_REFRESH_MS);
  };

  const handleOptionsUpdated = async (optionsHint?: ExtensionOptions): Promise<void> => {
    sonarrApiService.clearEtagCache();
    logger.configure({ enabled: (optionsHint?.debugLogging ?? false) || import.meta.env.DEV });
    await bumpSettingsEpoch();
    await mappingService.resetLookupState();
    const options = optionsHint ?? (await getExtensionOptionsSnapshot());
    const configured = !!(options?.sonarrUrl && options?.sonarrApiKey);
    if (configured) {
      await sonarrLibrary.refreshCache(options);
      await bumpLibraryEpoch();
    }
  };

  return createApiHandlers({
    sonarrApiService,
    anilistApiService,
    mappingService,
    overridesService,
    staticProvider,
    sonarrLibrary,
    anilistMetadataStore,
    overridesReady,
    ensureConfigured,
    scheduleLibraryRefresh,
    bumpLibraryEpoch,
    handleOptionsUpdated,
    getMappings: getMappingsHandler,
    updateSeries: updateSonarrSeriesHandler,
  });
};
