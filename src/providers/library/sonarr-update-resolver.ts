/** Sonarr-only update payload resolver for provider library mutations. */
// src/providers/library/sonarr-update-resolver.ts

import type { SonarrClient } from '@/providers/clients/sonarr.client';
import { createError, ErrorCode, logError, normalizeError } from '@/shared/errors';
import type { SonarrFormState } from '@/providers/settings/sonarr-settings.schema';
import type { ProviderCredentials, SonarrSeries } from '@/providers';
import { buildProviderFolderSlug, joinRootAndSlug } from './paths';
import {
  resolveMutationTagIds,
  resolveRequiredQualityProfileId,
  resolveRequiredRootFolderPath,
  shouldMoveProviderFiles,
} from './mutation-helpers';

type ResolveSonarrSeriesUpdateInput = {
  api: Pick<SonarrClient, 'getSeriesByTvdbId' | 'getSeriesById' | 'getTags' | 'createTag'>;
  credentials: ProviderCredentials;
  defaults: SonarrFormState;
  form: SonarrFormState;
  title: string;
  tvdbId: number;
};

type ResolvedSonarrSeriesUpdate = {
  seriesId: number;
  payload: SonarrSeries;
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
