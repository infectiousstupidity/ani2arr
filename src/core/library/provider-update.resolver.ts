/** Resolves final provider update payloads and move-file decisions from app inputs and provider state. */
// src/core/library/provider-update.resolver.ts

import type { RadarrClient } from '@/integrations/providers/radarr.client';
import type { SonarrClient } from '@/integrations/providers/sonarr.client';
import { createError, ErrorCode, logError, normalizeError } from '@/shared/errors';
import type { RadarrFormState } from '@/shared/schemas/providers/radarr-settings.schema';
import type { SonarrFormState } from '@/shared/schemas/providers/sonarr-settings.schema';
import type { ProviderCredentials, RadarrMovie, SonarrSeries } from '@/integrations/providers';
import {
  buildProviderFolderSlug,
  joinRootAndSlug,
} from '@/shared/utils/provider-library-paths';
import {
  resolveMutationTagIds,
  resolveRequiredQualityProfileId,
  resolveRequiredRootFolderPath,
  shouldMoveProviderFiles,
} from './provider-mutation.resolver';

type ResolveSonarrSeriesUpdateInput = {
  api: Pick<SonarrClient, 'getSeriesByTvdbId' | 'getSeriesById' | 'getTags' | 'createTag'>;
  credentials: ProviderCredentials;
  defaults: SonarrFormState;
  form: SonarrFormState;
  title: string;
  tvdbId: number;
};

type ResolveRadarrMovieUpdateInput = {
  api: Pick<RadarrClient, 'getMovieByTmdbId' | 'getMovieById' | 'getTags' | 'createTag'>;
  credentials: ProviderCredentials;
  defaults: RadarrFormState;
  form: RadarrFormState;
  title: string;
  tmdbId: number;
};

type ResolvedSonarrSeriesUpdate = {
  seriesId: number;
  payload: SonarrSeries;
  moveFiles: boolean;
};

type ResolvedRadarrMovieUpdate = {
  movieId: number;
  payload: RadarrMovie;
  moveFiles: boolean;
};

export async function resolveSonarrSeriesUpdate(
  input: ResolveSonarrSeriesUpdateInput,
): Promise<ResolvedSonarrSeriesUpdate> {
  const { api, credentials, defaults, form, title, tvdbId } = input;

  if (!Number.isFinite(tvdbId)) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      'Missing or invalid TVDB ID for update.',
      'Unable to update this series because its TVDB ID is unknown.',
    );
  }

  const existing = await api.getSeriesByTvdbId(tvdbId, credentials);
  if (!existing) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      `Series with TVDB ID ${tvdbId} not found in Sonarr.`,
      'Cannot edit because this series is not present in your Sonarr library.',
    );
  }

  let baseSeries: SonarrSeries = existing;
  try {
    baseSeries = await api.getSeriesById(existing.id, credentials);
  } catch (error) {
    const normalized = normalizeError(error);
    logError(normalized, `Ani2arrApi:updateSeries:fetch:${tvdbId}`);
  }

  const qualityProfileId = resolveRequiredQualityProfileId({
    value: form.qualityProfileId,
    fallback: baseSeries.qualityProfileId ?? defaults.qualityProfileId,
    providerLabel: 'Sonarr',
    entityLabel: 'series',
    actionLabel: 'update',
  });

  const rootFolderPath = resolveRequiredRootFolderPath({
    value: form.rootFolderPath,
    fallback: baseSeries.rootFolderPath || defaults.rootFolderPath,
    providerLabel: 'Sonarr',
    entityLabel: 'series',
    actionLabel: 'update',
  });

  const tags = await resolveMutationTagIds(
    api,
    credentials,
    form.tags,
    form.freeformTags,
    'Sonarr',
  );

  const nextPath = joinRootAndSlug(rootFolderPath, buildProviderFolderSlug(baseSeries, title));
  const moveFiles = shouldMoveProviderFiles(baseSeries.path, nextPath);

  return {
    seriesId: baseSeries.id,
    moveFiles,
    payload: {
      ...baseSeries,
      qualityProfileId,
      rootFolderPath,
      path: nextPath,
      seasonFolder: form.seasonFolder,
      seriesType: form.seriesType,
      monitored: form.monitorOption !== 'none',
      tags,
      addOptions: {
        ...baseSeries.addOptions,
        monitor: form.monitorOption,
        searchForMissingEpisodes: form.searchForMissingEpisodes,
        searchForCutoffUnmetEpisodes: form.searchForCutoffUnmetEpisodes,
      },
    },
  };
}

export async function resolveRadarrMovieUpdate(
  input: ResolveRadarrMovieUpdateInput,
): Promise<ResolvedRadarrMovieUpdate> {
  const { api, credentials, defaults, form, title, tmdbId } = input;

  if (!Number.isFinite(tmdbId)) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      'Missing or invalid TMDB ID for update.',
      'Unable to update this movie because its TMDB ID is unknown.',
    );
  }

  const existing = await api.getMovieByTmdbId(tmdbId, credentials);
  if (!existing) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      `Movie with TMDB ID ${tmdbId} not found in Radarr.`,
      'Cannot edit because this movie is not present in your Radarr library.',
    );
  }

  let baseMovie: RadarrMovie = existing;
  try {
    baseMovie = await api.getMovieById(existing.id, credentials);
  } catch (error) {
    const normalized = normalizeError(error);
    logError(normalized, `Ani2arrApi:updateMovie:fetch:${tmdbId}`);
  }

  const qualityProfileId = resolveRequiredQualityProfileId({
    value: form.qualityProfileId,
    fallback: baseMovie.qualityProfileId ?? defaults.qualityProfileId,
    providerLabel: 'Radarr',
    entityLabel: 'movie',
    actionLabel: 'update',
  });

  const rootFolderPath = resolveRequiredRootFolderPath({
    value: form.rootFolderPath,
    fallback: baseMovie.rootFolderPath || defaults.rootFolderPath,
    providerLabel: 'Radarr',
    entityLabel: 'movie',
    actionLabel: 'update',
  });

  const tags = await resolveMutationTagIds(
    api,
    credentials,
    form.tags,
    form.freeformTags,
    'Radarr',
  );

  const nextPath = joinRootAndSlug(rootFolderPath, buildProviderFolderSlug(baseMovie, title));
  const moveFiles = shouldMoveProviderFiles(baseMovie.path, nextPath);

  return {
    movieId: baseMovie.id,
    moveFiles,
    payload: {
      ...baseMovie,
      qualityProfileId,
      rootFolderPath,
      path: nextPath,
      monitored: form.monitored,
      minimumAvailability: form.minimumAvailability,
      tags,
      addOptions: {
        ...baseMovie.addOptions,
        searchForMovie: form.searchForMovie,
      },
    },
  };
}
