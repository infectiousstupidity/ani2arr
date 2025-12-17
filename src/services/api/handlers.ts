import type { Ani2arrApi } from '@/rpc';
import type { MappingOutput, UpdateSonarrInput } from '@/rpc/schemas';
import type { AnilistApiService } from '@/api/anilist.api';
import type { SonarrApiService } from '@/api/sonarr.api';
import type { MappingService } from '@/services/mapping';
import type { MappingOverridesService } from '@/services/mapping/overrides.service';
import type { SonarrLibrary } from '@/services/library/sonarr';
import type { AniListMetadataStore } from '@/services/anilist';
import type { StaticMappingProvider } from '@/services/mapping/static-mapping.provider';
import type {
  AniMedia,
  ExtensionOptions,
  LeanSonarrSeries,
  RequestPriority,
  SonarrCredentialsPayload,
  CheckSeriesStatusPayload,
} from '@/shared/types';
import { createError, ErrorCode, normalizeError } from '@/shared/utils/error-handling';
import { getExtensionOptionsSnapshot, setExtensionOptionsSnapshot } from '@/shared/utils/storage/storage';
import type { getMappingsHandler, GetMappingsInput } from './get-mappings';
import type { updateSonarrSeriesHandler } from './update-series';

type CommonDeps = {
  sonarrApiService: SonarrApiService;
  anilistApiService: AnilistApiService;
  mappingService: MappingService;
  overridesService: MappingOverridesService;
  staticProvider: StaticMappingProvider;
  sonarrLibrary: SonarrLibrary;
  anilistMetadataStore: AniListMetadataStore;
  overridesReady: Promise<void>;
  ensureConfigured: () => Promise<{ credentials: { url: string; apiKey: string }; options: ExtensionOptions }>;
  scheduleLibraryRefresh: (optionsHint?: ExtensionOptions) => void;
  bumpLibraryEpoch: (payload?: Record<string, unknown>) => Promise<void>;
  handleOptionsUpdated: (optionsHint?: ExtensionOptions) => Promise<void>;
  getMappings: typeof getMappingsHandler;
  updateSeries: typeof updateSonarrSeriesHandler;
};

export function createApiHandlers(deps: CommonDeps): Ani2arrApi {
  const {
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
    getMappings,
    updateSeries,
  } = deps;

  return {
    async resolveMapping(input) {
      await ensureConfigured();
      await overridesReady;

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
      const updated = await updateSeries(input, {
        sonarrApiService,
        sonarrLibrary,
        ensureConfigured,
      });
      scheduleLibraryRefresh();
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
      return getMappings(input as GetMappingsInput, {
        overridesService,
        staticProvider,
        mappingService,
        sonarrLibrary,
      });
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
}
