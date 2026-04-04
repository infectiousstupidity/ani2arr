/** Workflow that resolves AniList mapping, builds payload, and adds a Radarr movie. */
// src/providers/library/radarr-add-movie.ts

import { resolveRadarrAddPayload } from './radarr-add-payload';
import type { RadarrLibrary } from './radarr-library';
import type { RadarrClient } from '@/providers/clients/radarr.client';
import type { MappingService } from '@/services/mapping';
import type { ResolveExternalIdOptions } from '@/services/mapping/types';
import { createError, ErrorCode } from '@/shared/errors';
import type { AniListMediaHint } from '@/shared/schemas/anilist/anilist-media.schema';
import type { RadarrFormState } from '@/providers/settings/radarr-settings.schema';
import type { ProviderCredentials, RadarrMovie } from '@/providers';

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
