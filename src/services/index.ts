// src/services/index.ts
import { defineProxyService } from '@webext-core/proxy-service';
import { browser } from 'wxt/browser';
import { createTtlCache } from '@/cache';
import { CacheNamespaces } from '@/cache/namespaces';
import { SonarrApiService } from '@/api/sonarr.api';
import { AnilistApiService, type AniMedia } from '@/api/anilist.api';
import { MappingService, type ResolvedMapping, type StaticMappingPayload } from './mapping.service';
import { StaticMappingProvider } from './mapping/static-mapping.provider';
import { SonarrLookupClient } from './mapping/sonarr-lookup.client';
import { LibraryService } from './library.service';
import type {
  LeanSonarrSeries,
  SonarrSeries,
  SonarrRootFolder,
  SonarrQualityProfile,
  SonarrTag,
  SonarrLookupSeries,
  ExtensionOptions,
  ExtensionError,
  SonarrCredentialsPayload,
  CheckSeriesStatusPayload,
} from '@/types';
import { extensionOptions } from '@/utils/storage';
import { createError, ErrorCode, logError, normalizeError } from '@/utils/error-handling';
import type {
  ResolveInput,
  MappingOutput,
  StatusInput,
  StatusOutput,
  AddInput,
} from '@/rpc/schemas';

interface KitsunarrApi {
  resolveMapping(input: ResolveInput): Promise<MappingOutput>;
  getSeriesStatus(input: StatusInput): Promise<StatusOutput>;
  addToSonarr(input: AddInput): Promise<SonarrSeries>;
  notifySettingsChanged(): Promise<{ ok: true }>;
  getQualityProfiles(): Promise<SonarrQualityProfile[]>;
  getRootFolders(): Promise<SonarrRootFolder[]>;
  getTags(): Promise<SonarrTag[]>;
  testConnection(payload: SonarrCredentialsPayload): Promise<{ version: string }>;
  getSonarrMetadata(input?: { credentials?: SonarrCredentialsPayload }): Promise<{
    qualityProfiles: SonarrQualityProfile[];
    rootFolders: SonarrRootFolder[];
    tags: SonarrTag[];
  }>;
  initMappings(): Promise<void>;
}

function bindAll<T extends object>(instance: T): T {
  const proto = Object.getPrototypeOf(instance) as Record<string, unknown> | null;
  if (!proto) return instance;

  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === 'constructor') continue;
    const value = proto[key];
    if (typeof value === 'function') {
      (instance as Record<string, unknown>)[key] = (value as (...args: unknown[]) => unknown).bind(instance);
    }
  }

  return instance;
}

const initializeEpoch = async (key: 'libraryEpoch' | 'settingsEpoch'): Promise<number> => {
  try {
    const stored = await browser.storage.local.get(key);
    const value = stored[key];
    if (typeof value === 'number') {
      return value;
    }
  } catch (error) {
    logError(normalizeError(error), `KitsunarrApi:initEpoch:${key}`);
  }
  return 0;
};

export const [registerKitsunarrApi, getKitsunarrApi] =
  defineProxyService<KitsunarrApi, []>('KitsunarrApi', () => {
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

    const mappingService = bindAll(
      new MappingService(anilistApiService, staticProvider, lookupClient, {
        success: createTtlCache<ResolvedMapping>(CacheNamespaces.mappingResolvedSuccess),
        failure: createTtlCache<ExtensionError>(CacheNamespaces.mappingResolvedFailure),
      }),
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
      const options = await extensionOptions.getValue();
      if (!options?.sonarrUrl || !options?.sonarrApiKey) {
        throw createError(
          ErrorCode.SONARR_NOT_CONFIGURED,
          'Sonarr credentials are not configured.',
          'Configure your Sonarr connection in Kitsunarr options.',
        );
      }
      return {
        credentials: { url: options.sonarrUrl, apiKey: options.sonarrApiKey },
        options,
      };
    };

    const broadcast = async (topic: string, payload?: Record<string, unknown>): Promise<void> => {
      try {
        await browser.runtime.sendMessage({ _kitsunarr: true, topic, payload });
      } catch (error) {
        const normalized = normalizeError(error);
        if (normalized.message.includes('Receiving end does not exist')) {
          return;
        }
        logError(normalized, `KitsunarrApi:broadcast:${topic}`);
      }
    };

    const bumpLibraryEpoch = async (payload?: Record<string, unknown>): Promise<void> => {
      libraryEpoch += 1;
      const nextEpoch = libraryEpoch;
      await browser.storage.local.set({ libraryEpoch: nextEpoch });
      await broadcast('series-updated', { epoch: nextEpoch, ...payload });
    };

    const libraryService = bindAll(
      new LibraryService(
        sonarrApiService,
        mappingService,
        createTtlCache<LeanSonarrSeries[]>(CacheNamespaces.libraryLean),
        mutation => bumpLibraryEpoch({ tvdbId: mutation.tvdbId, action: mutation.action }),
      ),
    );

    const bumpSettingsEpoch = async (): Promise<void> => {
      settingsEpoch += 1;
      const nextEpoch = settingsEpoch;
      await browser.storage.local.set({ settingsEpoch: nextEpoch });
      await broadcast('settings-changed', { epoch: nextEpoch });
    };

    const api: KitsunarrApi = {
      async resolveMapping(input) {
        await ensureConfigured();
  const resolveOptions: Parameters<typeof mappingService.resolveTvdbId>[1] = {};
  const hints: NonNullable<Parameters<typeof mappingService.resolveTvdbId>[1]>['hints'] = {};
        if (input.primaryTitleHint) {
          hints.primaryTitle = input.primaryTitleHint;
        }
        if (input.metadata) {
          hints.domMedia = input.metadata;
        }
        if (Object.keys(hints).length > 0) {
          resolveOptions.hints = hints;
        }
        const mapping = await mappingService.resolveTvdbId(input.anilistId, resolveOptions);
        return {
          tvdbId: mapping.tvdbId,
          ...(mapping.successfulSynonym ? { successfulSynonym: mapping.successfulSynonym } : {}),
        } satisfies MappingOutput;
      },

      async getSeriesStatus(input) {
        await ensureConfigured();
        const payload: CheckSeriesStatusPayload = { anilistId: input.anilistId };
        if (input.title !== undefined) {
          payload.title = input.title;
        }
        if (input.metadata !== undefined) {
          payload.metadata = input.metadata;
        }
        const requestOptions: { force_verify?: boolean; network?: 'never'; ignoreFailureCache?: boolean } = {};
        if (input.force_verify) {
          requestOptions.force_verify = true;
        }
        if (input.network) {
          requestOptions.network = input.network;
        }
        if (input.ignoreFailureCache) {
          requestOptions.ignoreFailureCache = true;
        }
        return libraryService.getSeriesStatus(payload, requestOptions);
      },

      async addToSonarr(input) {
        const { options } = await ensureConfigured();

        const resolveOptions: Parameters<typeof mappingService.resolveTvdbId>[1] = {
          ignoreFailureCache: true,
        };
        const hints: NonNullable<Parameters<typeof mappingService.resolveTvdbId>[1]>['hints'] = {};
        if (input.primaryTitleHint) {
          hints.primaryTitle = input.primaryTitleHint;
        }
        if (input.metadata) {
          hints.domMedia = input.metadata;
        }
        if (Object.keys(hints).length > 0) {
          resolveOptions.hints = hints;
        }
        const mapping = await mappingService.resolveTvdbId(input.anilistId, resolveOptions);

        const payload = {
          ...input.form,
          anilistId: input.anilistId,
          title: input.title,
          tvdbId: mapping.tvdbId,
          ...(input.metadata ? { metadata: input.metadata } : {}),
        };

        const created = await sonarrApiService.addSeries(payload, options);
        await libraryService.addSeriesToCache(created);
        await libraryService.refreshCache(options);
        await bumpLibraryEpoch({ tvdbId: created.tvdbId });
        return created;
      },

      async notifySettingsChanged() {
        await bumpSettingsEpoch();
        await mappingService.resetLookupState();
        const options = await extensionOptions.getValue();
        const configured = !!(options?.sonarrUrl && options?.sonarrApiKey);
        if (configured) {
          await libraryService.refreshCache(options!);
          await bumpLibraryEpoch();
        }
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

      initMappings() {
        return mappingService.initStaticPairs();
      },
    };

    return api;
  });
