import type { RadarrApiService } from '@/clients/radarr.api';
import type { RadarrLibrary } from '@/services/library/radarr';
import type { UpdateRadarrInput } from '@/rpc/schemas';
import type { ExtensionOptions, RadarrCredentialsPayload, RadarrMovie } from '@/shared/types';
import { resolveArrTagIds } from '@/clients/tag-resolver';
import { createError, ErrorCode, logError, normalizeError } from '@/shared/errors/error-utils';
import { buildFolderSlug, joinRootAndSlug, paths } from '@/services/helpers/path-utils';

type UpdateMovieDeps = {
  radarrApiService: RadarrApiService;
  radarrLibrary: RadarrLibrary;
  ensureRadarrConfigured: () => Promise<{
    credentials: RadarrCredentialsPayload;
    options: ExtensionOptions;
  }>;
};

export async function updateRadarrMovieHandler(
  input: UpdateRadarrInput,
  deps: UpdateMovieDeps,
): Promise<RadarrMovie> {
  const { radarrApiService, radarrLibrary, ensureRadarrConfigured } = deps;
  const { credentials, options } = await ensureRadarrConfigured();

  if (!input.tmdbId || !Number.isFinite(input.tmdbId)) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      'Missing or invalid TMDB ID for update.',
      'Unable to update this movie because its TMDB ID is unknown.',
    );
  }

  const existing = await radarrApiService.getMovieByTmdbId(input.tmdbId, credentials);
  if (!existing) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      `Movie with TMDB ID ${input.tmdbId} not found in Radarr.`,
      'Cannot edit because this movie is not present in your Radarr library.',
    );
  }

  let baseMovie: RadarrMovie = existing;
  try {
    baseMovie = await radarrApiService.getMovieById(existing.id, credentials);
  } catch (error) {
    const normalized = normalizeError(error);
    logError(normalized, `Ani2arrApi:updateMovie:fetch:${input.tmdbId}`);
  }

  const resolvedQualityId =
    typeof input.form.qualityProfileId === 'number' && Number.isFinite(input.form.qualityProfileId)
      ? input.form.qualityProfileId
      : typeof baseMovie.qualityProfileId === 'number' && Number.isFinite(baseMovie.qualityProfileId)
        ? baseMovie.qualityProfileId
        : typeof options.providers.radarr.defaults.qualityProfileId === 'number' &&
            Number.isFinite(options.providers.radarr.defaults.qualityProfileId)
          ? options.providers.radarr.defaults.qualityProfileId
          : undefined;

  if (typeof resolvedQualityId !== 'number') {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      'Missing Radarr quality profile for update.',
      'Select a Radarr quality profile before updating this movie.',
    );
  }

  const resolvedRoot = input.form.rootFolderPath.trim() || baseMovie.rootFolderPath || '';
  if (!resolvedRoot) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      'Missing Radarr root folder for update.',
      'Select a Radarr root folder before updating this movie.',
    );
  }

  const tagsFromForm = Array.isArray(input.form.tags)
    ? input.form.tags.map(tag => Number(tag)).filter(tag => Number.isFinite(tag))
    : Array.isArray(baseMovie.tags)
      ? baseMovie.tags.filter((tag): tag is number => typeof tag === 'number')
      : [];

  const freeformTags = Array.isArray(input.form.freeformTags) ? input.form.freeformTags : [];
  const existingTags = await radarrApiService.getTags(credentials);
  const resolvedTags = await resolveArrTagIds({
    api: radarrApiService,
    credentials,
    existingIdsFromForm: tagsFromForm,
    freeformLabelsFromForm: freeformTags,
    existingTags,
    serviceLabel: 'Radarr',
  });

  const slug = buildFolderSlug(baseMovie, input.title);
  const nextPath = joinRootAndSlug(resolvedRoot, slug);
  const currentPathNormalized = paths.normalizePathForCompare(baseMovie.path);
  const nextPathNormalized = paths.normalizePathForCompare(nextPath);
  const moveFiles =
    currentPathNormalized !== null &&
    nextPathNormalized !== null &&
    currentPathNormalized !== nextPathNormalized;

  const mergedMovie: RadarrMovie = {
    ...baseMovie,
    qualityProfileId: resolvedQualityId,
    rootFolderPath: resolvedRoot,
    path: nextPath,
    monitored: input.form.monitored,
    minimumAvailability:
      input.form.minimumAvailability ??
      baseMovie.minimumAvailability ??
      options.providers.radarr.defaults.minimumAvailability,
    tags: resolvedTags,
    addOptions: {
      ...(baseMovie.addOptions ?? {}),
      searchForMovie: input.form.searchForMovie,
    },
  };

  const updated = await radarrApiService.updateMovie(baseMovie.id, mergedMovie, credentials, {
    moveFiles,
  });

  await radarrLibrary.addMovieToCache(updated);

  return updated;
}
