/** RPC handlers for provider-library status, add, and update flows. */
// src/rpc/handlers/library.handlers.ts

import { addRadarrMovie } from '@/core/library/add-radarr-movie';
import { addSonarrSeries } from '@/core/library/add-sonarr-series';
import { updateRadarrMovie } from '@/core/library/update-radarr-movie';
import { updateSonarrSeries } from '@/core/library/update-sonarr-series';
import type { Ani2arrApi } from '@/rpc';
import type { CheckMovieStatusPayload, CheckSeriesStatusPayload } from '@/rpc/types';
import type { RequestPriority } from '@/shared/types';
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

      const payload: CheckMovieStatusPayload = { anilistId: input.anilistId };
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
      const { credentials, options } = await ensureSonarrConfigured();
      await overridesReady;
      const created = await addSonarrSeries(
        {
          anilistId: input.anilistId,
          title: input.title,
          form: input.form,
          defaults: options.providers.sonarr.defaults,
          credentials,
          ...(input.primaryTitleHint !== undefined ? { primaryTitleHint: input.primaryTitleHint } : {}),
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        },
        {
          client: SonarrClient,
          mappingService,
          library: sonarrLibrary,
        },
      );
      scheduleLibraryRefresh('sonarr', options);
      await bumpLibraryRevision('sonarr');
      return created;
    },

    async addToRadarr(input) {
      const { credentials, options } = await ensureRadarrConfigured();
      await overridesReady;
      const created = await addRadarrMovie(
        {
          anilistId: input.anilistId,
          title: input.title,
          form: input.form,
          defaults: options.providers.radarr.defaults,
          credentials,
          ...(input.primaryTitleHint !== undefined ? { primaryTitleHint: input.primaryTitleHint } : {}),
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        },
        {
          client: RadarrClient,
          mappingService,
          library: radarrLibrary,
        },
      );
      scheduleLibraryRefresh('radarr', options);
      await bumpLibraryRevision('radarr');
      return created;
    },

    async updateSonarrSeries(input) {
      const { credentials, options } = await ensureSonarrConfigured();
      const updated = await updateSonarrSeries(
        {
          tvdbId: input.tvdbId,
          title: input.title,
          form: input.form,
          defaults: options.providers.sonarr.defaults,
          credentials,
        },
        {
          client: SonarrClient,
          library: sonarrLibrary,
        },
      );
      scheduleLibraryRefresh('sonarr');
      await bumpLibraryRevision('sonarr');
      return updated;
    },

    async updateRadarrMovie(input) {
      const { credentials, options } = await ensureRadarrConfigured();
      const updated = await updateRadarrMovie(
        {
          tmdbId: input.tmdbId,
          title: input.title,
          form: input.form,
          defaults: options.providers.radarr.defaults,
          credentials,
        },
        {
          client: RadarrClient,
          library: radarrLibrary,
        },
      );
      scheduleLibraryRefresh('radarr');
      await bumpLibraryRevision('radarr');
      return updated;
    },
  };

  return handlers;
}
