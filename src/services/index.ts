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
import { AniListMetadataStore } from './anilist-metadata.store';

import type {
  LeanSonarrSeries,
  SonarrLookupSeries,
  ExtensionOptions,
  AniMedia,
  ExtensionError,
  SonarrCredentialsPayload,
  CheckSeriesStatusPayload,
  SonarrSeries,
  RequestPriority,
  MappingSummary,
  MappingStatus,
  MappingSource,
} from '@/shared/types';
import { getExtensionOptionsSnapshot, setExtensionOptionsSnapshot } from '@/shared/utils/storage';
import { createError, ErrorCode, logError, normalizeError } from '@/shared/utils/error-handling';
import type { MappingOutput, UpdateSonarrInput } from '@/rpc/schemas';
import { type Ani2arrApi } from '@/rpc';
import { resolveSonarrTagIds } from '@/shared/utils/sonarr-tags';
import { logger } from '@/shared/utils/logger';

const DEBOUNCED_LIBRARY_REFRESH_MS = 45 * 1000;

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

const trimTrailingSeparators = (input: string): string => input.replace(/[\\/]+$/, '').trim();

const normalizePathForCompare = (input?: string | null): string | null => {
  if (!input) return null;
  return trimTrailingSeparators(input).replace(/\\/g, '/').toLowerCase();
};

const extractFolderSlug = (path?: string | null, rootFolderPath?: string | null): string | null => {
  if (!path) return null;
  const normalizedPath = trimTrailingSeparators(path).replace(/\\/g, '/');
  const normalizedRoot = rootFolderPath ? trimTrailingSeparators(rootFolderPath).replace(/\\/g, '/') : null;

  if (normalizedRoot && normalizedPath.toLowerCase().startsWith(normalizedRoot.toLowerCase())) {
    const remainder = normalizedPath.slice(normalizedRoot.length).replace(/^\/+/, '');
    if (remainder.length > 0) return remainder;
  }

  const segments = normalizedPath.split('/');
  const last = segments[segments.length - 1];
  return last?.length ? last : null;
};

const sanitizeFolderSegment = (segment: string): string => {
  const replaced = segment.replace(/[\\/]+/g, ' ').trim();
  return replaced.replace(/\s+/g, ' ');
};

const buildFolderSlug = (series: SonarrSeries, fallbackTitle: string): string => {
  const fromPath = extractFolderSlug(series.path, series.rootFolderPath);
  if (fromPath) return fromPath;
  if (series.folder && series.folder.trim()) return series.folder.trim();
  if (series.titleSlug && series.titleSlug.trim()) return series.titleSlug.trim();

  const baseTitle = sanitizeFolderSegment(series.title || fallbackTitle || 'Series');
  const tvdbPart =
    typeof series.tvdbId === 'number' && Number.isFinite(series.tvdbId)
      ? ` [tvdb-${series.tvdbId}]`
      : '';
  return `${baseTitle}${tvdbPart}`;
};

const joinRootAndSlug = (rootFolderPath: string, slug: string): string => {
  const normalizedRoot = trimTrailingSeparators(rootFolderPath);
  if (!normalizedRoot) return slug;
  const separator = normalizedRoot.includes('\\') ? '\\' : '/';
  return `${normalizedRoot}${separator}${slug}`;
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

  const api: Ani2arrApi = {
    async resolveMapping(input) {
      await ensureConfigured();
      await overridesReady;

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
      await overridesReady;
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
      await overridesReady;

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
      scheduleLibraryRefresh(options);
      await bumpLibraryEpoch({ tvdbId: created.tvdbId });
      return created;
    },

    async updateSonarrSeries(input: UpdateSonarrInput) {
      const { credentials, options } = await ensureConfigured();

      if (!input.tvdbId || !Number.isFinite(input.tvdbId)) {
        throw createError(
          ErrorCode.VALIDATION_ERROR,
          'Missing or invalid TVDB ID for update.',
          'Unable to update this series because its TVDB ID is unknown.',
        );
      }

      const existing = await sonarrApiService.getSeriesByTvdbId(input.tvdbId, credentials);
      if (!existing) {
        throw createError(
          ErrorCode.VALIDATION_ERROR,
          `Series with TVDB ID ${input.tvdbId} not found in Sonarr.`,
          'Cannot edit because this series is not present in your Sonarr library.',
        );
      }

      let baseSeries: SonarrSeries = existing;
      try {
        baseSeries = await sonarrApiService.getSeriesById(existing.id, credentials);
      } catch (error) {
        const normalized = normalizeError(error);
        logError(normalized, `Ani2arrApi:updateSeries:fetch:${input.tvdbId}`);
      }

      const resolvedQualityId =
        typeof input.form.qualityProfileId === 'number' && Number.isFinite(input.form.qualityProfileId)
          ? input.form.qualityProfileId
          : typeof baseSeries.qualityProfileId === 'number' && Number.isFinite(baseSeries.qualityProfileId)
            ? baseSeries.qualityProfileId
            : typeof options.defaults.qualityProfileId === 'number' && Number.isFinite(options.defaults.qualityProfileId)
              ? options.defaults.qualityProfileId
              : undefined;

      const tagsFromForm = Array.isArray(input.form.tags)
        ? input.form.tags.map(tag => Number(tag)).filter(tag => Number.isFinite(tag))
        : Array.isArray(baseSeries.tags)
          ? baseSeries.tags.filter((tag): tag is number => typeof tag === 'number')
          : [];

      const freeformTags = Array.isArray(input.form.freeformTags) ? input.form.freeformTags : [];

      const existingTags = await sonarrApiService.getTags(credentials);
      const resolvedTags = await resolveSonarrTagIds(credentials, tagsFromForm, freeformTags, existingTags);

      const resolvedRoot = input.form.rootFolderPath || baseSeries.rootFolderPath || '';
      const slug = buildFolderSlug(baseSeries, input.title);
      const nextPath = joinRootAndSlug(resolvedRoot, slug);

      const currentPathNormalized = normalizePathForCompare(baseSeries.path);
      const nextPathNormalized = normalizePathForCompare(nextPath);
      const moveFiles =
        currentPathNormalized !== null &&
        nextPathNormalized !== null &&
        currentPathNormalized !== nextPathNormalized;

      const monitored = (input.form.monitorOption ?? options.defaults.monitorOption) !== 'none';

      const resolvedSeriesType = input.form.seriesType ?? baseSeries.seriesType ?? options.defaults.seriesType;

      const mergedSeries: SonarrSeries = {
        ...baseSeries,
        ...(resolvedQualityId !== undefined ? { qualityProfileId: resolvedQualityId } : {}),
        rootFolderPath: resolvedRoot,
        path: nextPath,
        seasonFolder: input.form.seasonFolder,
        seriesType: resolvedSeriesType,
        monitored,
        tags: resolvedTags,
      };

      const updated = await sonarrApiService.updateSeries(baseSeries.id, mergedSeries, credentials, {
        moveFiles,
      });

      await sonarrLibrary.addSeriesToCache(updated);
      scheduleLibraryRefresh(options);
      await bumpLibraryEpoch({ tvdbId: updated.tvdbId, action: 'updated' });

      return updated;
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

    async searchAniList(input) {
      try {
        const request = typeof input.limit === 'number' ? { limit: input.limit } : {};
        return await anilistApiService.searchMedia(input.search, request);
      } catch (error) {
        throw normalizeError(error);
      }
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
      await overridesReady;
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
      const linkedAniListIdsByTvdbId: Record<number, number[]> = {};
      if (typeof mappingService.getLinkedAniListIdsForTvdb === 'function') {
        const uniqueTvdbIds = new Set<number>();
        for (const series of results) {
          if (typeof series?.tvdbId === 'number' && Number.isFinite(series.tvdbId)) {
            uniqueTvdbIds.add(series.tvdbId);
          }
        }
        for (const tvdbId of uniqueTvdbIds) {
          const linked = mappingService.getLinkedAniListIdsForTvdb(tvdbId);
          if (linked.length > 0) {
            linkedAniListIdsByTvdbId[tvdbId] = linked;
          }
        }
      }
      return {
        results,
        libraryTvdbIds,
        ...(Object.keys(statsMap).length > 0 ? { statsMap } : {}),
        ...(Object.keys(linkedAniListIdsByTvdbId).length > 0 ? { linkedAniListIdsByTvdbId } : {}),
      };
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
      await overridesReady;
      const linkedIds =
        typeof mappingService.getLinkedAniListIdsForTvdb === 'function'
          ? mappingService.getLinkedAniListIdsForTvdb(input.tvdbId)
          : [];
      const conflictingAniListIds = linkedIds.filter(id => id !== input.anilistId);
      if (conflictingAniListIds.length > 0 && input.force !== true) {
        throw createError(
          ErrorCode.VALIDATION_ERROR,
          `TVDB ID ${input.tvdbId} is already linked to other AniList entries.`,
          'This TVDB ID is already linked to other AniList entries. Confirm if you want to share it.',
          { conflictingAniListIds },
        );
      }
      await overridesService.set(input.anilistId, input.tvdbId);
      await mappingService.evictResolved(input.anilistId);
      const options = await getExtensionOptionsSnapshot();
      if (options?.sonarrUrl && options?.sonarrApiKey) {
        scheduleLibraryRefresh(options);
      }
      await bumpLibraryEpoch({ anilistId: input.anilistId, tvdbId: input.tvdbId, action: 'override:set' });
      return { ok: true as const };
    },

    async clearMappingOverride(input) {
      await overridesReady;
      await overridesService.clear(input.anilistId);
      await mappingService.evictResolved(input.anilistId);
      const options = await getExtensionOptionsSnapshot();
      if (options?.sonarrUrl && options?.sonarrApiKey) {
        scheduleLibraryRefresh(options);
      }
      await bumpLibraryEpoch({ anilistId: input.anilistId, action: 'override:clear' });
      return { ok: true as const };
    },

    async setMappingIgnore(input) {
      await overridesReady;
      await overridesService.setIgnore(input.anilistId);
      await mappingService.evictResolved(input.anilistId);
      await bumpLibraryEpoch({ anilistId: input.anilistId, action: 'override:ignore' });
      return { ok: true as const };
    },

    async clearMappingIgnore(input) {
      await overridesReady;
      await overridesService.clearIgnore(input.anilistId);
      await mappingService.evictResolved(input.anilistId);
      await bumpLibraryEpoch({ anilistId: input.anilistId, action: 'override:clearIgnore' });
      return { ok: true as const };
    },

    async getMappingOverrides() {
      await overridesReady;
      return overridesService.list();
    },

    async clearAllMappingOverrides() {
      await overridesReady;
      const existing = overridesService.list();
      await overridesService.clearAll();
      await Promise.all(existing.map(entry => mappingService.evictResolved(entry.anilistId)));
      const options = await getExtensionOptionsSnapshot();
      if (options?.sonarrUrl && options?.sonarrApiKey) {
        scheduleLibraryRefresh(options);
      }
      await bumpLibraryEpoch({ action: 'override:clearAll' });
      return { ok: true as const };
    },

    async getMappings(input) {
      await overridesReady;
      const normalizedQuery = input?.query?.trim().toLowerCase() || '';
      const sources =
        input?.sources && input.sources.length > 0
          ? new Set<MappingSource>(input.sources)
          : new Set<MappingSource>(['manual', 'ignored', 'auto']);
      const providers =
        input?.providers && input.providers.length > 0
          ? new Set<MappingSummary['provider']>(input.providers)
          : new Set<MappingSummary['provider']>(['sonarr']);
      if (!providers.has('sonarr')) {
        return { mappings: [], total: 0, nextCursor: null };
      }

      const defaultLimit = normalizedQuery ? 200 : 500;
      const limit = Math.min(Math.max(input?.limit ?? defaultLimit, 1), 2000);
      const cursor = input?.cursor;

      let library: LeanSonarrSeries[] = [];
      try {
        library = await sonarrLibrary.getLeanSeriesList();
      } catch {
        library = [];
      }

      const libraryByTvdbId = new Map<number, LeanSonarrSeries>();
      for (const series of library) {
        libraryByTvdbId.set(series.tvdbId, series);
      }

      const priorityMap: Record<MappingSource, number> = {
        ignored: 3,
        manual: 2,
        upstream: 1,
        auto: 0,
      };

      type Candidate = {
        externalId: { id: number; kind: 'tvdb' } | null;
        source: MappingSource;
        updatedAt: number;
        hadResolveAttempt?: boolean;
        priority: number;
      };

      const candidates = new Map<number, Candidate>();
      const applyCandidate = (anilistId: number, candidate: Omit<Candidate, 'priority' | 'updatedAt'> & { updatedAt?: number }) => {
        if (!Number.isFinite(anilistId)) return;
        if (!sources.has(candidate.source)) return;
        const priority = priorityMap[candidate.source];
        const existing = candidates.get(anilistId);
        if (existing && existing.priority > priority) return;
        candidates.set(anilistId, { ...candidate, updatedAt: candidate.updatedAt ?? 0, priority });
      };

      const ignores = overridesService.listIgnores();
      for (const ignore of ignores) {
        applyCandidate(ignore.anilistId, {
          externalId: null,
          source: 'ignored',
          updatedAt: ignore.updatedAt,
          hadResolveAttempt: true,
        });
      }

      const overrides = overridesService.list();
      for (const entry of overrides) {
        applyCandidate(entry.anilistId, {
          externalId: { id: entry.tvdbId, kind: 'tvdb' },
          source: 'manual',
          updatedAt: entry.updatedAt,
          hadResolveAttempt: true,
        });
      }

      if (sources.has('upstream')) {
        for (const pair of staticProvider.listAllPairs()) {
          applyCandidate(pair.anilistId, {
            externalId: { id: pair.tvdbId, kind: 'tvdb' },
            source: 'upstream',
          });
        }
      }

      const recorded = mappingService.getRecordedResolvedMappings();
      for (const entry of recorded) {
        applyCandidate(entry.anilistId, {
          externalId: { id: entry.tvdbId, kind: 'tvdb' },
          source: entry.source === 'upstream' ? 'upstream' : 'auto',
          updatedAt: entry.updatedAt,
          hadResolveAttempt: entry.source === 'auto',
        });
      }

      const matchesQuery = (summary: MappingSummary): boolean => {
        if (!normalizedQuery) return true;
        const haystackParts: string[] = [
          String(summary.anilistId),
          summary.externalId ? String(summary.externalId.id) : '',
          summary.providerMeta?.title ?? '',
        ];
        const haystack = haystackParts.join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
      };

      const results: MappingSummary[] = [];
      for (const [anilistId, candidate] of candidates.entries()) {
        const externalId = candidate.externalId ?? null;
        const tvdbId = externalId?.id ?? null;
        const series = tvdbId != null ? libraryByTvdbId.get(tvdbId) ?? null : null;
        const linkedAniListIds = tvdbId != null ? mappingService.getLinkedAniListIdsForTvdb(tvdbId) : [];
        const status: MappingStatus =
          tvdbId === null ? 'unmapped' : series ? 'in-provider' : 'not-in-provider';

        const inLibraryCount =
          series?.statistics?.episodeCount ??
          series?.statistics?.episodeFileCount;
        const statusLabel =
          series && typeof (series as { status?: unknown }).status === 'string'
            ? (series as { status?: string }).status
            : undefined;
        const providerMeta = series
          ? {
              ...(series.title ? { title: series.title } : {}),
              type: 'series' as const,
              ...(statusLabel ? { statusLabel } : {}),
            }
          : undefined;
        const hadResolveAttempt =
          candidate.hadResolveAttempt ||
          candidate.source === 'auto' ||
          candidate.source === 'manual' ||
          candidate.source === 'ignored';

        const summary: MappingSummary = {
          anilistId,
          provider: 'sonarr',
          externalId,
          source: candidate.source,
          status,
          updatedAt: candidate.updatedAt,
          ...(linkedAniListIds.length ? { linkedAniListIds } : {}),
          ...(typeof inLibraryCount === 'number' ? { inLibraryCount } : {}),
          ...(providerMeta ? { providerMeta } : {}),
          ...(hadResolveAttempt ? { hadResolveAttempt: true } : {}),
        };
        if (matchesQuery(summary)) {
          results.push(summary);
        }
      }

      results.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.anilistId - b.anilistId);
      const total = results.length;
      const filteredByCursor =
        cursor && typeof cursor.updatedAt === 'number'
          ? results.filter(summary => {
              const ts = summary.updatedAt ?? 0;
              if (ts < cursor.updatedAt) return true;
              if (ts > cursor.updatedAt) return false;
              return summary.anilistId > cursor.anilistId;
            })
          : results;
      const page = filteredByCursor.slice(0, limit);
      const last = page[page.length - 1];
      const nextCursor =
        filteredByCursor.length > page.length && last
          ? {
              updatedAt: last.updatedAt ?? 0,
              anilistId: last.anilistId,
            }
          : null;

      return { mappings: page, total, nextCursor };
    },

    async getAniListMetadata(input) {
      const ids = Array.isArray(input?.ids) ? input.ids : [];
      const normalizedIds = ids.filter(id => typeof id === 'number' && Number.isFinite(id) && id > 0);
      if (normalizedIds.length === 0) {
        return { metadata: [], missingIds: [] };
      }
      const result = await anilistMetadataStore.getMetadata(normalizedIds, {
        refreshStale: input?.refreshStale ?? true,
        ...(input?.maxBatch !== undefined ? { maxBatch: input.maxBatch } : {}),
      });
      return {
        metadata: result.metadata,
        ...(result.missingIds?.length ? { missingIds: result.missingIds } : {}),
      };
    },
  };

  return api;
};
