/** RPC handlers for provider metadata, search, and validation flows. */
// src/rpc/handlers/provider.handlers.ts

import type { Ani2arrApi } from '@/rpc';
import type { ProviderCredentials, SonarrSeriesSnapshot } from '@/providers';
import type { ApiHandlerDeps } from './handler-deps';

export function createProviderHandlers(deps: ApiHandlerDeps): Pick<
  Ani2arrApi,
  | 'testProviderConnection'
  | 'getSonarrMetadata'
  | 'getRadarrMetadata'
  | 'searchSonarr'
  | 'searchRadarr'
  | 'validateTvdbId'
  | 'validateTmdbId'
> {
  const {
    SonarrClient,
    RadarrClient,
    mappingService,
    sonarrLibrary,
    radarrLibrary,
    overridesReady,
    ensureSonarrConfigured,
    ensureRadarrConfigured,
  } = deps;

  const testProviderConnectionInternal: Ani2arrApi['testProviderConnection'] = async input => {
    return input.provider === 'sonarr'
      ? SonarrClient.testConnection(input.credentials)
      : RadarrClient.testConnection(input.credentials);
  };

  const handlers = {
    testProviderConnection(input) {
      return testProviderConnectionInternal(input);
    },

    async getSonarrMetadata(input) {
      const maybeCredentials = input?.credentials;
      let credentials: ProviderCredentials;

      if (maybeCredentials?.url && maybeCredentials.apiKey) {
        credentials = maybeCredentials;
      } else {
        const ensured = await ensureSonarrConfigured();
        credentials = ensured.credentials;
      }

      const [qualityProfiles, rootFolders, tags] = await Promise.all([
        SonarrClient.getQualityProfiles(credentials),
        SonarrClient.getRootFolders(credentials),
        SonarrClient.getTags(credentials),
      ]);

      return { qualityProfiles, rootFolders, tags };
    },

    async getRadarrMetadata(input) {
      const maybeCredentials = input?.credentials;
      let credentials: ProviderCredentials;
      if (maybeCredentials?.url && maybeCredentials.apiKey) {
        credentials = maybeCredentials;
      } else {
        const ensured = await ensureRadarrConfigured();
        credentials = ensured.credentials;
      }

      const [qualityProfiles, rootFolders, tags] = await Promise.all([
        RadarrClient.getQualityProfiles(credentials),
        RadarrClient.getRootFolders(credentials),
        RadarrClient.getTags(credentials),
      ]);

      return { qualityProfiles, rootFolders, tags };
    },

    async searchSonarr(input) {
      const { credentials } = await ensureSonarrConfigured();
      await overridesReady;

      const [results, library] = await Promise.all([
        SonarrClient.lookupSeriesByTerm(input.term, credentials),
        sonarrLibrary.getLeanSeriesList(),
      ]);

      const libraryTvdbIds = library.map(s => s.tvdbId);
      const statsMap: Record<number, NonNullable<SonarrSeriesSnapshot['statistics']>> = {};
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
        RadarrClient.lookupMovieByTerm(input.term, credentials),
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
      const found = await SonarrClient.getSeriesByTvdbId(input.tvdbId, credentials);
      let inCatalog = false;
      try {
        const hits = await SonarrClient.lookupSeriesByTerm(`tvdb:${input.tvdbId}`, credentials);
        inCatalog = hits.some(h => h?.tvdbId === input.tvdbId);
      } catch {
        // ignore
      }
      return { inLibrary: !!found, inCatalog };
    },

    async validateTmdbId(input) {
      const { credentials } = await ensureRadarrConfigured();
      const found = await RadarrClient.getMovieByTmdbId(input.tmdbId, credentials);
      let inCatalog = false;
      try {
        const lookup = await RadarrClient.lookupMovieByTmdbId(input.tmdbId, credentials);
        inCatalog = lookup?.tmdbId === input.tmdbId;
      } catch {
        // ignore
      }
      return { inLibrary: !!found, inCatalog };
    },
  } satisfies Pick<
    Ani2arrApi,
    | 'testProviderConnection'
    | 'getSonarrMetadata'
    | 'getRadarrMetadata'
    | 'searchSonarr'
    | 'searchRadarr'
    | 'validateTvdbId'
    | 'validateTmdbId'
  >;

  return handlers;
}
