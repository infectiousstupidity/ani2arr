import type { Ani2arrApi } from '@/rpc';
import type { MappingOutput, UpdateRadarrInput, UpdateSonarrInput } from '@/rpc/schemas';
import type { AnilistApiService } from '@/clients/anilist.api';
import type { RadarrApiService } from '@/clients/radarr.api';
import type { SonarrApiService } from '@/clients/sonarr.api';
import type { MappingService } from '@/services/mapping';
import type { MappingOverridesService } from '@/services/mapping/overrides.service';
import type { SonarrLibrary } from '@/services/library/sonarr';
import type { RadarrLibrary } from '@/services/library/radarr';
import type { AniListMetadataStore } from '@/services/anilist';
import type { StaticMappingProvider } from '@/services/mapping/static-mapping.provider';
import type {
  AniMedia,
  ExtensionOptions,
  LeanSonarrSeries,
  RadarrCredentialsPayload,
  RequestPriority,
  SonarrCredentialsPayload,
  CheckSeriesStatusPayload,
} from '@/shared/types';
import { createError, ErrorCode, normalizeError } from '@/shared/errors/error-utils';
import { getExtensionOptionsSnapshot, setExtensionOptionsSnapshot } from '@/shared/options/storage';
import type { getMappingsHandler, GetMappingsInput } from './get-mappings';
import type { updateRadarrMovieHandler } from './update-movie';
import type { updateSonarrSeriesHandler } from './update-series';

type CommonDeps = {
  sonarrApiService: SonarrApiService;
  radarrApiService: RadarrApiService;
  anilistApiService: AnilistApiService;
  mappingService: MappingService;
  overridesService: MappingOverridesService;
  staticProvider: StaticMappingProvider;
  sonarrLibrary: SonarrLibrary;
  radarrLibrary: RadarrLibrary;
  anilistMetadataStore: AniListMetadataStore;
  overridesReady: Promise<void>;
  ensureSonarrConfigured: () => Promise<{ credentials: SonarrCredentialsPayload; options: ExtensionOptions }>;
  ensureRadarrConfigured: () => Promise<{ credentials: RadarrCredentialsPayload; options: ExtensionOptions }>;
  scheduleLibraryRefresh: (provider: 'sonarr' | 'radarr', optionsHint?: ExtensionOptions) => void;
  bumpLibraryEpoch: (provider: 'sonarr' | 'radarr', payload?: Record<string, unknown>) => Promise<void>;
  handleOptionsUpdated: (optionsHint?: ExtensionOptions) => Promise<void>;
  getMappings: typeof getMappingsHandler;
  updateMovie: typeof updateRadarrMovieHandler;
  updateSeries: typeof updateSonarrSeriesHandler;
};

export function createApiHandlers(deps: CommonDeps): Ani2arrApi {
  const {
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
    handleOptionsUpdated,
    getMappings,
    updateMovie,
    updateSeries,
  } = deps;

  const assertCompatibleExternalId = (provider: 'sonarr' | 'radarr', externalId: { id: number; kind: 'tvdb' | 'tmdb' }) => {
    const expectedKind = provider === 'sonarr' ? 'tvdb' : 'tmdb';
    if (externalId.kind !== expectedKind) {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        `Provider ${provider} requires ${expectedKind.toUpperCase()} mapping IDs.`,
        provider === 'sonarr'
          ? 'Sonarr overrides must use TVDB IDs.'
          : 'Radarr overrides must use TMDB IDs.',
      );
    }
  };

  const handlers = {
    async resolveMapping(input) {
      await ensureSonarrConfigured();
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
      await ensureSonarrConfigured();
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

    async getMovieStatus(input) {
      await ensureRadarrConfigured();
      await overridesReady;
      const payload: CheckSeriesStatusPayload = { anilistId: input.anilistId };
      if (input.title !== undefined) payload.title = input.title;
      if (input.metadata !== undefined) payload.metadata = input.metadata;

      const requestOptions: { force_verify?: boolean; network?: 'never'; ignoreFailureCache?: boolean; priority?: RequestPriority } = {};
      if (input.force_verify) requestOptions.force_verify = true;
      if (input.network) requestOptions.network = input.network;
      if (input.ignoreFailureCache) requestOptions.ignoreFailureCache = true;
      if (input.priority) requestOptions.priority = input.priority;

      const status = await radarrLibrary.getMovieStatus(payload, requestOptions);
      return { ...status, overrideActive: mappingService.isOverrideActive(input.anilistId, 'radarr') };
    },

    async addToSonarr(input) {
      const { options } = await ensureSonarrConfigured();
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
      scheduleLibraryRefresh('sonarr', options);
      await bumpLibraryEpoch('sonarr', { tvdbId: created.tvdbId });
      return created;
    },

    async addToRadarr(input) {
      const { credentials, options } = await ensureRadarrConfigured();
      await overridesReady;

      const resolveOptions: Parameters<typeof mappingService.resolveExternalId>[2] = { ignoreFailureCache: true };
      const hints: NonNullable<NonNullable<Parameters<typeof mappingService.resolveExternalId>[2]>['hints']> = {};
      if (input.primaryTitleHint) hints.primaryTitle = input.primaryTitleHint;
      if (input.metadata) hints.domMedia = input.metadata;
      if (Object.keys(hints).length > 0) resolveOptions.hints = hints;

      const mapping = await mappingService.resolveExternalId('radarr', input.anilistId, resolveOptions);
      if (!mapping || mapping.externalId.kind !== 'tmdb') {
        throw createError(
          ErrorCode.VALIDATION_ERROR,
          `Could not resolve AniList ID ${input.anilistId} to a TMDB ID.`,
          'Unable to add this movie to Radarr because no matching TMDB entry was found.',
        );
      }

      const qualityProfileId =
        typeof input.form.qualityProfileId === 'number' && Number.isFinite(input.form.qualityProfileId)
          ? input.form.qualityProfileId
          : typeof options.providers.radarr.defaults.qualityProfileId === 'number' &&
              Number.isFinite(options.providers.radarr.defaults.qualityProfileId)
            ? options.providers.radarr.defaults.qualityProfileId
            : undefined;

      const rootFolderPath = input.form.rootFolderPath.trim() || options.providers.radarr.defaults.rootFolderPath.trim();

      if (typeof qualityProfileId !== 'number') {
        throw createError(
          ErrorCode.VALIDATION_ERROR,
          'Missing Radarr quality profile for add.',
          'Select a Radarr quality profile before adding this movie.',
        );
      }

      if (!rootFolderPath) {
        throw createError(
          ErrorCode.VALIDATION_ERROR,
          'Missing Radarr root folder for add.',
          'Select a Radarr root folder before adding this movie.',
        );
      }

      const created = await radarrApiService.addMovie(
        {
          title: input.title,
          tmdbId: mapping.externalId.id,
          qualityProfileId,
          rootFolderPath,
          monitored: input.form.monitored,
          minimumAvailability: input.form.minimumAvailability,
          tags: input.form.tags,
          freeformTags: input.form.freeformTags,
          ...(typeof input.metadata?.startYear === 'number' ? { year: input.metadata.startYear } : {}),
          addOptions: {
            searchForMovie: input.form.searchForMovie,
          },
        },
        credentials,
      );
      await radarrLibrary.addMovieToCache(created);
      scheduleLibraryRefresh('radarr', options);
      await bumpLibraryEpoch('radarr', { tmdbId: created.tmdbId });
      return created;
    },

    async updateSonarrSeries(input: UpdateSonarrInput) {
      const updated = await updateSeries(input, {
        sonarrApiService,
        sonarrLibrary,
        ensureSonarrConfigured,
      });
      scheduleLibraryRefresh('sonarr');
      await bumpLibraryEpoch('sonarr', { tvdbId: updated.tvdbId, action: 'updated' });
      return updated;
    },

    async updateRadarrMovie(input: UpdateRadarrInput) {
      const updated = await updateMovie(input, {
        radarrApiService,
        radarrLibrary,
        ensureRadarrConfigured,
      });
      scheduleLibraryRefresh('radarr');
      await bumpLibraryEpoch('radarr', { tmdbId: updated.tmdbId, action: 'updated' });
      return updated;
    },

    async notifySettingsChanged() {
      const options = await getExtensionOptionsSnapshot();
      await handleOptionsUpdated(options);
      return { ok: true as const };
    },

    async updateDefaults(defaults) {
      const current = await getExtensionOptionsSnapshot();
      const next: ExtensionOptions = {
        ...current,
        providers: {
          ...current.providers,
          sonarr: {
            ...current.providers.sonarr,
            defaults,
          },
        },
      };
      await setExtensionOptionsSnapshot(next);
      await handleOptionsUpdated(next);
      return { ok: true as const };
    },

    async updateRadarrDefaults(defaults) {
      const current = await getExtensionOptionsSnapshot();
      const next: ExtensionOptions = {
        ...current,
        providers: {
          ...current.providers,
          radarr: {
            ...current.providers.radarr,
            defaults,
          },
        },
      };
      await setExtensionOptionsSnapshot(next);
      await handleOptionsUpdated(next);
      return { ok: true as const };
    },

    async getQualityProfiles() {
      const { credentials } = await ensureSonarrConfigured();
      return sonarrApiService.getQualityProfiles(credentials);
    },

    async getRootFolders() {
      const { credentials } = await ensureSonarrConfigured();
      return sonarrApiService.getRootFolders(credentials);
    },

    async getTags() {
      const { credentials } = await ensureSonarrConfigured();
      return sonarrApiService.getTags(credentials);
    },

    testConnection(payload) {
      return sonarrApiService.testConnection(payload);
    },

    async testRadarrConnection(payload) {
      const status = await radarrApiService.testConnection(payload);
      return { version: status.version };
    },

    async getSonarrMetadata(input) {
      const maybeCredentials = input?.credentials;
      let credentials: SonarrCredentialsPayload;
      if (maybeCredentials?.url && maybeCredentials.apiKey) {
        credentials = maybeCredentials;
      } else {
        const ensured = await ensureSonarrConfigured();
        credentials = ensured.credentials;
      }
      const [qualityProfiles, rootFolders, tags] = await Promise.all([
        sonarrApiService.getQualityProfiles(credentials),
        sonarrApiService.getRootFolders(credentials),
        sonarrApiService.getTags(credentials),
      ]);
      return { qualityProfiles, rootFolders, tags };
    },

    async getRadarrMetadata(input) {
      const maybeCredentials = input?.credentials;
      const credentials =
        maybeCredentials?.url && maybeCredentials.apiKey
          ? maybeCredentials
          : (await ensureRadarrConfigured()).credentials;
      return radarrApiService.getMetadata(credentials);
    },

    async prefetchAniListMedia(ids) {
      const map = await anilistApiService.fetchMediaBatch(ids, {
        priority: 'low',
        source: 'browse-prefetch',
      });
      return Array.from(map.entries()) as Array<[number, AniMedia]>;
    },

    async fetchAniListMedia(anilistId) {
      if (typeof anilistId !== 'number' || !Number.isFinite(anilistId) || anilistId <= 0) {
        return null;
      }
      const media = await anilistApiService.fetchMediaWithRelations(anilistId, {
        priority: 'high',
        source: 'media-modal',
      });
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
      const { credentials } = await ensureSonarrConfigured();
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

    async searchRadarr(input) {
      const { credentials } = await ensureRadarrConfigured();
      await overridesReady;
      const [results, library] = await Promise.all([
        radarrApiService.lookupMovieByTerm(input.term, credentials),
        radarrLibrary.getLeanMovieList(),
      ]);
      const libraryTmdbIds = library.map(movie => movie.tmdbId);
      const linkedAniListIdsByTmdbId: Record<number, number[]> = {};
      const uniqueTmdbIds = new Set<number>();
      for (const movie of results) {
        if (typeof movie?.tmdbId === 'number' && Number.isFinite(movie.tmdbId)) {
          uniqueTmdbIds.add(movie.tmdbId);
        }
      }
      for (const tmdbId of uniqueTmdbIds) {
        const linked = mappingService.getLinkedAniListIds('radarr', { id: tmdbId, kind: 'tmdb' });
        if (linked.length > 0) {
          linkedAniListIdsByTmdbId[tmdbId] = linked;
        }
      }
      return {
        results,
        libraryTmdbIds,
        ...(Object.keys(linkedAniListIdsByTmdbId).length > 0 ? { linkedAniListIdsByTmdbId } : {}),
      };
    },

    async validateTvdbId(input) {
      const { credentials } = await ensureSonarrConfigured();
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

    async validateTmdbId(input) {
      const { credentials } = await ensureRadarrConfigured();
      const found = await radarrApiService.getMovieByTmdbId(input.tmdbId, credentials);
      let inCatalog = false;
      try {
        const lookup = await radarrApiService.lookupMovieByTmdbId(input.tmdbId, credentials);
        inCatalog = lookup?.tmdbId === input.tmdbId;
      } catch {
        // ignore
      }
      return { inLibrary: !!found, inCatalog };
    },

    async setMappingOverride(input) {
      await overridesReady;
      assertCompatibleExternalId(input.provider, input.externalId);

      if (input.provider === 'sonarr') {
        const linkedIds =
          typeof mappingService.getLinkedAniListIdsForTvdb === 'function'
            ? mappingService.getLinkedAniListIdsForTvdb(input.externalId.id)
            : [];
        const conflictingAniListIds = linkedIds.filter(id => id !== input.anilistId);
        if (conflictingAniListIds.length > 0 && input.force !== true) {
          throw createError(
            ErrorCode.VALIDATION_ERROR,
            `TVDB ID ${input.externalId.id} is already linked to other AniList entries.`,
            'This TVDB ID is already linked to other AniList entries. Confirm if you want to share it.',
            { conflictingAniListIds },
          );
        }
      }

      await overridesService.set(input.provider, input.anilistId, input.externalId);
      await mappingService.evictResolved(input.anilistId, input.provider);
      if (input.provider === 'sonarr') {
        const options = await getExtensionOptionsSnapshot();
        if (options?.providers.sonarr.url && options?.providers.sonarr.apiKey) {
          scheduleLibraryRefresh('sonarr', options);
        }
      }

      await bumpLibraryEpoch(input.provider, {
        anilistId: input.anilistId,
        externalId: input.externalId,
        action: 'override:set',
      });
      return { ok: true as const };
    },

    async clearMappingOverride(input) {
      await overridesReady;
      await overridesService.clear(input.provider, input.anilistId);
      await mappingService.evictResolved(input.anilistId, input.provider);
      if (input.provider === 'sonarr') {
        const options = await getExtensionOptionsSnapshot();
        if (options?.providers.sonarr.url && options?.providers.sonarr.apiKey) {
          scheduleLibraryRefresh('sonarr', options);
        }
      }
      await bumpLibraryEpoch(input.provider, { anilistId: input.anilistId, action: 'override:clear' });
      return { ok: true as const };
    },

    async setMappingIgnore(input) {
      await overridesReady;
      await overridesService.setIgnore(input.provider, input.anilistId);
      await mappingService.evictResolved(input.anilistId, input.provider);
      await bumpLibraryEpoch(input.provider, { anilistId: input.anilistId, action: 'override:ignore' });
      return { ok: true as const };
    },

    async clearMappingIgnore(input) {
      await overridesReady;
      await overridesService.clearIgnore(input.provider, input.anilistId);
      await mappingService.evictResolved(input.anilistId, input.provider);
      await bumpLibraryEpoch(input.provider, { anilistId: input.anilistId, action: 'override:clearIgnore' });
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
      await Promise.all(
        existing.map(entry => mappingService.evictResolved(entry.anilistId, entry.provider)),
      );
      const options = await getExtensionOptionsSnapshot();
      if (options?.providers.sonarr.url && options?.providers.sonarr.apiKey) {
        scheduleLibraryRefresh('sonarr', options);
      }
      await bumpLibraryEpoch('sonarr', { action: 'override:clearAll' });
      await bumpLibraryEpoch('radarr', { action: 'override:clearAll' });
      return { ok: true as const };
    },

    async getMappings(input) {
      await overridesReady;
      return getMappings(input as GetMappingsInput, {
        overridesService,
        staticProvider,
        mappingService,
        sonarrLibrary,
        radarrLibrary,
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
  } satisfies Ani2arrApi;

  return handlers;
}
