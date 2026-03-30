/** RPC handlers for provider-library status, add, and update flows. */
// src/rpc/handlers/library.handlers.ts

import type { Ani2arrApi } from '@/rpc';
import { createError, ErrorCode } from '@/shared/errors';
import type { CheckSeriesStatusPayload, RequestPriority } from '@/shared/types';
import type { ApiHandlerDeps } from './handler-deps';

type LibraryHandlerMethods = Pick<
  Ani2arrApi,
  | 'getSeriesStatus'
  | 'getMovieStatus'
  | 'addToSonarr'
  | 'addToRadarr'
  | 'updateSonarrSeries'
  | 'updateRadarrMovie'
>;

export function createLibraryHandlers(deps: ApiHandlerDeps): LibraryHandlerMethods {
  const {
    SonarrClient,
    RadarrClient,
    mappingService,
    sonarrLibrary,
    radarrLibrary,
    overridesReady,
    ensureSonarrConfigured,
    ensureRadarrConfigured,
    scheduleLibraryRefresh,
    bumpLibraryRevision,
    updateMovie,
    updateSeries,
  } = deps;

  const handlers: LibraryHandlerMethods = {
    async getSeriesStatus(input) {
      await ensureSonarrConfigured();
      await overridesReady;

      const payload: CheckSeriesStatusPayload = { anilistId: input.anilistId };
      if (input.title !== undefined) payload.title = input.title;
      if (input.metadata !== undefined) payload.metadata = input.metadata;

      const requestOptions: {
        force_verify?: boolean;
        network?: 'never';
        ignoreFailureCache?: boolean;
        priority?: RequestPriority;
      } = {};
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

      const requestOptions: {
        force_verify?: boolean;
        network?: 'never';
        ignoreFailureCache?: boolean;
        priority?: RequestPriority;
      } = {};
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

      const created = await SonarrClient.addSeries(payload, options);
      await sonarrLibrary.addSeriesToCache(created);
      scheduleLibraryRefresh('sonarr', options);
      await bumpLibraryRevision('sonarr');
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

      const rootFolderPath =
        input.form.rootFolderPath.trim() || options.providers.radarr.defaults.rootFolderPath.trim();

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

      const created = await RadarrClient.addMovie(
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
      await bumpLibraryRevision('radarr');
      return created;
    },

    async updateSonarrSeries(input) {
      const updated = await updateSeries(input, {
        SonarrClient,
        sonarrLibrary,
        ensureSonarrConfigured,
      });
      scheduleLibraryRefresh('sonarr');
      await bumpLibraryRevision('sonarr');
      return updated;
    },

    async updateRadarrMovie(input) {
      const updated = await updateMovie(input, {
        RadarrClient,
        radarrLibrary,
        ensureRadarrConfigured,
      });
      scheduleLibraryRefresh('radarr');
      await bumpLibraryRevision('radarr');
      return updated;
    },
  };

  return handlers;
}
