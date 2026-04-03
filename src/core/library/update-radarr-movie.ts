/** Workflow that resolves provider state and updates an existing Radarr movie. */
// src/core/library/update-radarr-movie.ts

import { resolveRadarrMovieUpdate } from '@/core/library/provider-update.resolver';
import type { RadarrLibrary } from '@/core/library/radarr-library';
import type { RadarrClient } from '@/integrations/providers/radarr.client';
import type { RadarrFormState } from '@/shared/schemas/providers/radarr-settings.schema';
import type { ProviderCredentials, RadarrMovie } from '@/integrations/providers';

type UpdateRadarrMovieInput = {
  tmdbId: number;
  title: string;
  form: RadarrFormState;
  defaults: RadarrFormState;
  credentials: ProviderCredentials;
};

type UpdateRadarrMovieDeps = {
  client: Pick<RadarrClient, 'getMovieByTmdbId' | 'getMovieById' | 'getTags' | 'createTag' | 'updateMovie'>;
  library: Pick<RadarrLibrary, 'addMovieToCache'>;
};

export async function updateRadarrMovie(
  input: UpdateRadarrMovieInput,
  deps: UpdateRadarrMovieDeps,
): Promise<RadarrMovie> {
  const { client, library } = deps;

  const resolvedUpdate = await resolveRadarrMovieUpdate({
    api: client,
    credentials: input.credentials,
    defaults: input.defaults,
    form: input.form,
    title: input.title,
    tmdbId: input.tmdbId,
  });

  const updated = await client.updateMovie(
    resolvedUpdate.movieId,
    resolvedUpdate.payload,
    input.credentials,
    { moveFiles: resolvedUpdate.moveFiles },
  );

  await library.addMovieToCache(updated);
  return updated;
}
