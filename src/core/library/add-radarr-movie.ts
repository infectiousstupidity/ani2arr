/** Workflow that resolves AniList mapping, builds payload, and adds a Radarr movie. */
// src/core/library/add-radarr-movie.ts

import { resolveRadarrAddPayload } from '@/core/library/provider-add.resolver';
import type { RadarrLibrary } from '@/core/library/radarr-library';
import type { RadarrClient } from '@/integrations/providers/radarr.client';
import type { MappingService } from '@/services/mapping';
import type { ResolveExternalIdOptions } from '@/services/mapping/types';
import { createError, ErrorCode } from '@/shared/errors';
import type { RadarrFormState } from '@/shared/schemas/providers/radarr-settings.schema';
import type { AniListMediaHint } from '@/shared/types';
import type { ProviderCredentials, RadarrMovie } from '@/shared/types/providers';

type AddRadarrMovieInput = {
  anilistId: number;
  title: string;
  primaryTitleHint?: string;
  metadata?: AniListMediaHint | null;
  form: RadarrFormState;
  defaults: RadarrFormState;
  credentials: ProviderCredentials;
};

type AddRadarrMovieDeps = {
  client: Pick<RadarrClient, 'addMovie' | 'getTags' | 'createTag'>;
  mappingService: Pick<MappingService, 'resolveExternalId'>;
  library: Pick<RadarrLibrary, 'addMovieToCache'>;
};

export async function addRadarrMovie(
  input: AddRadarrMovieInput,
  deps: AddRadarrMovieDeps,
): Promise<RadarrMovie> {
  const { client, mappingService, library } = deps;

  const resolveOptions: ResolveExternalIdOptions = { ignoreFailureCache: true };
  const hints: NonNullable<NonNullable<ResolveExternalIdOptions['hints']>> = {};
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

  const payload = await resolveRadarrAddPayload({
    api: client,
    credentials: input.credentials,
    defaults: input.defaults,
    form: input.form,
    title: input.title,
    tmdbId: mapping.externalId.id,
    ...(typeof input.metadata?.startYear === 'number' ? { year: input.metadata.startYear } : {}),
  });

  const created = await client.addMovie(payload, input.credentials);
  await library.addMovieToCache(created);
  return created;
}
