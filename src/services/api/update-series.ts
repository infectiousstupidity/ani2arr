import type { SonarrApiService } from '@/api/sonarr.api';
import type { SonarrLibrary } from '@/services/library/sonarr';
import type { UpdateSonarrInput } from '@/rpc/schemas';
import type { ExtensionOptions, SonarrCredentialsPayload, SonarrSeries } from '@/shared/types';
import { createError, ErrorCode, logError, normalizeError } from '@/shared/utils/error-handling';
import { resolveSonarrTagIds } from '@/services/api/sonarr-tag-resolver';
import { buildFolderSlug, joinRootAndSlug, paths } from '@/services/helpers/path-utils';

type UpdateSeriesDeps = {
  sonarrApiService: SonarrApiService;
  sonarrLibrary: SonarrLibrary;
  ensureConfigured: () => Promise<{ credentials: SonarrCredentialsPayload; options: ExtensionOptions }>;
};

export async function updateSonarrSeriesHandler(
  input: UpdateSonarrInput,
  deps: UpdateSeriesDeps,
): Promise<SonarrSeries> {
  const { sonarrApiService, sonarrLibrary, ensureConfigured } = deps;
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
  const resolvedTags = await resolveSonarrTagIds(
    sonarrApiService,
    credentials,
    tagsFromForm,
    freeformTags,
    existingTags,
  );

  const resolvedRoot = input.form.rootFolderPath || baseSeries.rootFolderPath || '';
  const slug = buildFolderSlug(baseSeries, input.title);
  const nextPath = joinRootAndSlug(resolvedRoot, slug);

  const currentPathNormalized = paths.normalizePathForCompare(baseSeries.path);
  const nextPathNormalized = paths.normalizePathForCompare(nextPath);
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

  return updated;
}
