/** RPC handler that updates an existing Sonarr series using resolved form and library state. */
// src/rpc/handlers/update-series.handlers.ts

import { resolveProviderTagIds } from '@/core/library/provider-tags.resolver';
import type { SonarrClient } from '@/integrations/providers/sonarr.client';
import type { SonarrLibrary } from '@/services/library/sonarr';
import type { UpdateSonarrInput } from '@/rpc/schemas';
import type { ExtensionOptions } from '@/shared/types';
import type { ProviderCredentials, SonarrSeries } from '@/shared/types/providers';
import { createError, ErrorCode, logError, normalizeError } from '@/shared/errors';
import {
  buildProviderFolderSlug,
  joinRootAndSlug,
  normalizePathForCompare,
} from '@/shared/utils/provider-library-paths';

type UpdateSeriesDeps = {
  SonarrClient: SonarrClient;
  sonarrLibrary: SonarrLibrary;
  ensureSonarrConfigured: () => Promise<{ credentials: ProviderCredentials; options: ExtensionOptions }>;
};

export async function updateSonarrSeriesHandler(
  input: UpdateSonarrInput,
  deps: UpdateSeriesDeps,
): Promise<SonarrSeries> {
  const { SonarrClient, sonarrLibrary, ensureSonarrConfigured } = deps;
  const { credentials, options } = await ensureSonarrConfigured();

  if (!input.tvdbId || !Number.isFinite(input.tvdbId)) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      'Missing or invalid TVDB ID for update.',
      'Unable to update this series because its TVDB ID is unknown.',
    );
  }

  const existing = await SonarrClient.getSeriesByTvdbId(input.tvdbId, credentials);
  if (!existing) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      `Series with TVDB ID ${input.tvdbId} not found in Sonarr.`,
      'Cannot edit because this series is not present in your Sonarr library.',
    );
  }

  let baseSeries: SonarrSeries = existing;
  try {
    baseSeries = await SonarrClient.getSeriesById(existing.id, credentials);
  } catch (error) {
    const normalized = normalizeError(error);
    logError(normalized, `Ani2arrApi:updateSeries:fetch:${input.tvdbId}`);
  }

  const resolvedQualityId =
    typeof input.form.qualityProfileId === 'number' && Number.isFinite(input.form.qualityProfileId)
      ? input.form.qualityProfileId
      : typeof baseSeries.qualityProfileId === 'number' && Number.isFinite(baseSeries.qualityProfileId)
        ? baseSeries.qualityProfileId
        : typeof options.providers.sonarr.defaults.qualityProfileId === 'number' &&
            Number.isFinite(options.providers.sonarr.defaults.qualityProfileId)
          ? options.providers.sonarr.defaults.qualityProfileId
          : undefined;

  const tagsFromForm = Array.isArray(input.form.tags)
    ? input.form.tags.map(tag => Number(tag)).filter(tag => Number.isFinite(tag))
    : Array.isArray(baseSeries.tags)
      ? baseSeries.tags.filter((tag): tag is number => typeof tag === 'number')
      : [];

  const freeformTags = Array.isArray(input.form.freeformTags) ? input.form.freeformTags : [];

  const existingTags = await SonarrClient.getTags(credentials);
  const resolvedTags = await resolveProviderTagIds({
    api: SonarrClient,
    credentials,
    existingIdsFromForm: tagsFromForm,
    freeformLabelsFromForm: freeformTags,
    existingTags,
    serviceLabel: 'Sonarr',
  });

  const resolvedRoot = input.form.rootFolderPath || baseSeries.rootFolderPath || '';
  const slug = buildProviderFolderSlug(baseSeries, input.title);
  const nextPath = joinRootAndSlug(resolvedRoot, slug);

  const currentPathNormalized = normalizePathForCompare(baseSeries.path);
  const nextPathNormalized = normalizePathForCompare(nextPath);
  const moveFiles =
    currentPathNormalized !== null &&
    nextPathNormalized !== null &&
    currentPathNormalized !== nextPathNormalized;

  const monitored = (input.form.monitorOption ?? options.providers.sonarr.defaults.monitorOption) !== 'none';

  const resolvedSeriesType =
    input.form.seriesType ?? baseSeries.seriesType ?? options.providers.sonarr.defaults.seriesType;

  const mergedSeries: SonarrSeries = {
    ...baseSeries,
    ...(resolvedQualityId !== undefined ? { qualityProfileId: resolvedQualityId } : {}),
    rootFolderPath: resolvedRoot,
    path: nextPath,
    seasonFolder: input.form.seasonFolder,
    seriesType: resolvedSeriesType,
    monitored,
    tags: resolvedTags,
    addOptions: {
      ...(baseSeries.addOptions ?? {}),
      searchForMissingEpisodes: input.form.searchForMissingEpisodes,
      searchForCutoffUnmetEpisodes: input.form.searchForCutoffUnmetEpisodes,
      monitor: input.form.monitorOption ?? options.providers.sonarr.defaults.monitorOption,
    },
  };

  const updated = await SonarrClient.updateSeries(baseSeries.id, mergedSeries, credentials, {
    moveFiles,
  });

  await sonarrLibrary.addSeriesToCache(updated);

  return updated;
}
