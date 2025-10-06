// src/services/index.ts
import { defineProxyService } from '@webext-core/proxy-service';
import { browser } from 'wxt/browser';
import { createTtlCache } from '@/cache';
import { SonarrApiService } from '@/api/sonarr.api';
import { AnilistApiService } from '@/api/anilist.api';
import {
  MappingService,
  type ResolvedMapping,
  type StaticMappingPayload,
} from './mapping.service';
import { LibraryService } from './library.service';
import type {
  LeanSonarrSeries,
  SonarrSeries,
  SonarrRootFolder,
  SonarrQualityProfile,
  SonarrTag,
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
  getSeriesStatus(input: StatusInput, options?: { requestId?: string }): Promise<StatusOutput>;
  cancelSeriesStatus(input: { requestId: string }): Promise<void>;
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
    const anilistApiService = bindAll(new AnilistApiService());

    const mappingService = bindAll(new MappingService(sonarrApiService, anilistApiService, {
      success: createTtlCache<ResolvedMapping>('mapping:success'),
      failure: createTtlCache<ExtensionError>('mapping:failure'),
      staticPrimary: createTtlCache<StaticMappingPayload>('mapping:static:primary'),
      staticFallback: createTtlCache<StaticMappingPayload>('mapping:static:fallback'),
    }));

    let libraryEpoch = 0;
    let settingsEpoch = 0;
    const statusAbortControllers = new Map<string, AbortController>();

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
        createTtlCache<LeanSonarrSeries[]>('library:lean'),
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

      async getSeriesStatus(input, options) {
        const requestId = options?.requestId;
        let controller: AbortController | undefined;
        if (requestId) {
          controller = new AbortController();
          statusAbortControllers.set(requestId, controller);
        }

        const throwIfAborted = () => {
          if (!controller?.signal.aborted) {
            return;
          }
          const reason = controller.signal.reason;
          if (reason instanceof Error) {
            throw reason;
          }
          if (reason !== undefined) {
            if (reason instanceof DOMException) {
              throw reason;
            }
            const description = typeof reason === 'string' ? reason : 'The operation was aborted.';
            throw new DOMException(description, 'AbortError');
          }
          throw new DOMException('The operation was aborted.', 'AbortError');
        };

        try {
          await ensureConfigured();
          throwIfAborted();

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
          throwIfAborted();
          const result = await libraryService.getSeriesStatus(
            payload,
            requestOptions,
            controller ? { signal: controller.signal } : undefined,
          );
          return result;
        } finally {
          if (requestId) {
            const current = statusAbortControllers.get(requestId);
            if (current === controller) {
              statusAbortControllers.delete(requestId);
            }
          }
        }
      },

      async cancelSeriesStatus({ requestId }) {
        const controller = statusAbortControllers.get(requestId);
        if (!controller) {
          return;
        }
        statusAbortControllers.delete(requestId);
        if (!controller.signal.aborted) {
          controller.abort(new DOMException('The operation was aborted.', 'AbortError'));
        }
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
