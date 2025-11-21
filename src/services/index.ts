import { browser } from 'wxt/browser';
import { createTtlCache } from '@/cache';
import { CacheNamespaces } from '@/cache/namespaces';
import { SonarrApiService } from '@/api/sonarr.api';
import { AnilistApiService } from '@/api/anilist.api';
import { MappingService, type ResolvedMapping, type StaticMappingPayload } from './mapping';
import { MappingOverridesService } from './mapping/overrides.service';
import { StaticMappingProvider } from './mapping/static-mapping.provider';
import { SonarrLookupClient } from './mapping/sonarr-lookup.client';
import { SonarrLibrary } from '@/services/library/sonarr';

import type {
  LeanSonarrSeries,
  SonarrLookupSeries,
  ExtensionOptions,
  AniMedia,
  ExtensionError,
  SonarrCredentialsPayload,
  CheckSeriesStatusPayload,
  RequestPriority,
} from '@/shared/types';
import { getExtensionOptionsSnapshot, setExtensionOptionsSnapshot } from '@/shared/utils/storage';
import { createError, ErrorCode, logError, normalizeError } from '@/shared/utils/error-handling';
import type { MappingOutput } from '@/rpc/schemas';
import { type Ani2arrApi } from '@/rpc';

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
  void overridesService.init();

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

  let libraryEpoch = 0;
  let settingsEpoch = 0;

  void initializeEpoch('libraryEpoch').then(epoch => {
    libraryEpoch = epoch;
  });
  void initializeEpoch('settingsEpoch').then(epoch => {
    settingsEpoch = epoch;
  });

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

  const broadcast = async (topic: string, payload?: Record<string, unknown>): Promise<void> => {
    try {
      await browser.runtime.sendMessage({ _a2a: true, topic, payload });
    } catch (error) {
      const normalized = normalizeError(error);
      if (normalized.message.includes('Receiving end does not exist')) return;
      logError(normalizeError(error), `Ani2arrApi:broadcast:${topic}`);
    }
  };

  const bumpLibraryEpoch = async (payload?: Record<string, unknown>): Promise<void> => {
    libraryEpoch += 1;
    const nextEpoch = libraryEpoch;
    await browser.storage.local.set({ libraryEpoch: nextEpoch });
    await broadcast('series-updated', { epoch: nextEpoch, ...payload });
  };

  // REPLACED: LibraryService -> SonarrLibrary
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

  const handleOptionsUpdated = async (optionsHint?: ExtensionOptions): Promise<void> => {
    sonarrApiService.clearEtagCache();
    await bumpSettingsEpoch();
    await mappingService.resetLookupState();
    const options = optionsHint ?? (await getExtensionOptionsSnapshot());
    const configured = !!(options?.sonarrUrl && options?.sonarrApiKey);
    if (configured) {
      await sonarrLibrary.refreshCache(options);
      await bumpLibraryEpoch();
    }
  };

  const api: Ani2arrApi = {
    async resolveMapping(input) {
      await ensureConfigured();

      // Fast path: local library index only
      try {
        const payload: CheckSeriesStatusPayload = { anilistId: input.anilistId };
        if (input.primaryTitleHint !== undefined) payload.title = input.primaryTitleHint;
        if (input.metadata !== undefined) payload.metadata = input.metadata ?? null;
        const status = await sonarrLibrary.getSeriesStatus(payload, { network: 'never', ignoreFailureCache: true });
        if (status.exists && typeof status.tvdbId === 'number') {
          return {
            tvdbId: status.tvdbId,
            ...(status.successfulSynonym ? { successfulSynonym: status.successfulSynonym } : {}),
          } satisfies MappingOutput;
        }
      } catch {
        // ignore fast-path errors
      }

      const resolveOptions: Parameters<typeof mappingService.resolveTvdbId>[1] = {};
      const hints: NonNullable<Parameters<typeof mappingService.resolveTvdbId>[1]>['hints'] = {};
      if (input.primaryTitleHint) hints.primaryTitle = input.primaryTitleHint;
      if (input.metadata) hints.domMedia = input.metadata;
      if (Object.keys(hints).length > 0) resolveOptions.hints = hints;

      const mapping = await mappingService.resolveTvdbId(input.anilistId, resolveOptions);
      return {
        tvdbId: mapping ? mapping.tvdbId : null,
        ...(mapping?.successfulSynonym ? { successfulSynonym: mapping.successfulSynonym } : {}),
      } satisfies MappingOutput;
    },

    async getSeriesStatus(input) {
      await ensureConfigured();
      const payload: CheckSeriesStatusPayload = { anilistId: input.anilistId };
      if (input.title !== undefined) payload.title = input.title;
      if (input.metadata !== undefined) payload.metadata = input.metadata;

      const requestOptions: { force_verify?: boolean; network?: 'never'; ignoreFailureCache?: boolean; priority?: RequestPriority } = {};
      if (input.force_verify) requestOptions.force_verify = true;
      if (input.network) requestOptions.network = input.network;
      if (input.ignoreFailureCache) requestOptions.ignoreFailureCache = true;
      if (input.priority) requestOptions.priority = input.priority;

      const status = await sonarrLibrary.getSeriesStatus(payload, requestOptions);
      return { ...status, overrideActive: mappingService.isOverrideActive(input.anilistId) };
    },

    async addToSonarr(input) {
      const { options } = await ensureConfigured();

      const resolveOptions: Parameters<typeof mappingService.resolveTvdbId>[1] = { ignoreFailureCache: true };
      const hints: NonNullable<Parameters<typeof mappingService.resolveTvdbId>[1]>['hints'] = {};
      if (input.primaryTitleHint) hints.primaryTitle = input.primaryTitleHint;
      if (input.metadata) hints.domMedia = input.metadata;
      if (Object.keys(hints).length > 0) resolveOptions.hints = hints;

      const mapping = await mappingService.resolveTvdbId(input.anilistId, resolveOptions);
      if (!mapping) {
        throw createError(
          ErrorCode.VALIDATION_ERROR,
          `Could not resolve AniList ID ${input.anilistId} to a TVDB ID.`,
          'Unable to add this series to Sonarr because no matching TVDB entry was found.',
        );
      }

      const payload = {
        ...input.form,
        anilistId: input.anilistId,
        title: input.title,
        tvdbId: mapping.tvdbId,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };

      const created = await sonarrApiService.addSeries(payload, options);
      await sonarrLibrary.addSeriesToCache(created);
      await sonarrLibrary.refreshCache(options);
      await bumpLibraryEpoch({ tvdbId: created.tvdbId });
      return created;
    },

    async notifySettingsChanged() {
      const options = await getExtensionOptionsSnapshot();
      await handleOptionsUpdated(options);
      return { ok: true as const };
    },

    async updateDefaults(defaults) {
      const current = await getExtensionOptionsSnapshot();
      const next: ExtensionOptions = { ...current, defaults };
      await setExtensionOptionsSnapshot(next);
      await handleOptionsUpdated(next);
      return { ok: true as const };
    },

    async getQualityProfiles() {
      const { credentials } = await ensureConfigured();
      return sonarrApiService.getQualityProfiles(credentials);
    },

    async getRootFolders() {
      const { credentials } = await ensureConfigured();
      return sonarrApiService.getRootFolders(credentials);
    },

    async getTags() {
      const { credentials } = await ensureConfigured();
      return sonarrApiService.getTags(credentials);
    },

    testConnection(payload) {
      return sonarrApiService.testConnection(payload);
    },

    async getSonarrMetadata(input) {
      const maybeCredentials = input?.credentials;
      let credentials: SonarrCredentialsPayload;
      if (maybeCredentials?.url && maybeCredentials.apiKey) {
        credentials = maybeCredentials;
      } else {
        const ensured = await ensureConfigured();
        credentials = ensured.credentials;
      }
      const [qualityProfiles, rootFolders, tags] = await Promise.all([
        sonarrApiService.getQualityProfiles(credentials),
        sonarrApiService.getRootFolders(credentials),
        sonarrApiService.getTags(credentials),
      ]);
      return { qualityProfiles, rootFolders, tags };
    },

    async prefetchAniListMedia(ids) {
      const map = await anilistApiService.fetchMediaBatch(ids);
      return Array.from(map.entries()) as Array<[number, AniMedia]>;
    },

    async fetchAniListMedia(anilistId) {
      if (typeof anilistId !== 'number' || !Number.isFinite(anilistId) || anilistId <= 0) {
        return null;
      }
      // Prefer cached media; background refresh will occur if stale.
      const media = await anilistApiService.fetchMediaWithRelations(anilistId, { priority: 'high' });
      return media ?? null;
    },

    async getStaticMapped(ids) {
      const hits: number[] = [];
      for (const id of ids) {
        const hit = staticProvider.get(id);
        if (hit) hits.push(id);
      }
      return hits;
    },

    initMappings() {
      return mappingService.initStaticPairs();
    },

    async searchSonarr(input) {
      const { credentials } = await ensureConfigured();
      const [results, library] = await Promise.all([
        sonarrApiService.lookupSeriesByTerm(input.term, credentials),
        sonarrLibrary.getLeanSeriesList(),
      ]);
      const libraryTvdbIds = library.map(s => s.tvdbId);
      const statsMap: Record<number, NonNullable<LeanSonarrSeries['statistics']>> = {};
      for (const s of library) {
        if (s.statistics) {
          statsMap[s.tvdbId] = s.statistics;
        }
      }
      return { results, libraryTvdbIds, ...(Object.keys(statsMap).length > 0 ? { statsMap } : {}) };
    },

    async validateTvdbId(input) {
      const { credentials } = await ensureConfigured();
      const found = await sonarrApiService.getSeriesByTvdbId(input.tvdbId, credentials);
      let inCatalog = false;
      try {
        const hits = await sonarrApiService.lookupSeriesByTerm(`tvdb:${input.tvdbId}`, credentials);
        inCatalog = hits.some(h => h?.tvdbId === input.tvdbId);
      } catch {
        // ignore
      }
      return { inLibrary: !!found, inCatalog };
    },

    async setMappingOverride(input) {
      await overridesService.set(input.anilistId, input.tvdbId);
      await mappingService.evictResolved(input.anilistId);
      const options = await getExtensionOptionsSnapshot();
      if (options?.sonarrUrl && options?.sonarrApiKey) {
        await sonarrLibrary.refreshCache(options);
      }
      await bumpLibraryEpoch({ anilistId: input.anilistId, tvdbId: input.tvdbId, action: 'override:set' });
      return { ok: true as const };
    },

    async clearMappingOverride(input) {
      await overridesService.clear(input.anilistId);
      await mappingService.evictResolved(input.anilistId);
      const options = await getExtensionOptionsSnapshot();
      if (options?.sonarrUrl && options?.sonarrApiKey) {
        await sonarrLibrary.refreshCache(options);
      }
      await bumpLibraryEpoch({ anilistId: input.anilistId, action: 'override:clear' });
      return { ok: true as const };
    },
  };

  return api;
};
