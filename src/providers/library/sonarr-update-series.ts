/** Workflow that resolves provider state and updates an existing Sonarr series. */
// src/providers/library/sonarr-update-series.ts

import { resolveSonarrSeriesUpdate } from './sonarr-update-resolver';
import type { SonarrLibrary } from './sonarr-library';
import type { SonarrClient } from '@/providers/clients/sonarr.client';
import type { SonarrFormState } from '@/providers/settings/sonarr-settings.schema';
import type { ProviderCredentials, SonarrSeries } from '@/providers';

type UpdateSonarrSeriesInput = {
  tvdbId: number;
  title: string;
  form: SonarrFormState;
  defaults: SonarrFormState;
  credentials: ProviderCredentials;
};

type UpdateSonarrSeriesDeps = {
  client: Pick<SonarrClient, 'getSeriesByTvdbId' | 'getSeriesById' | 'getTags' | 'createTag' | 'updateSeries'>;
  library: Pick<SonarrLibrary, 'addSeriesToCache'>;
};

export async function updateSonarrSeries(
  input: UpdateSonarrSeriesInput,
  deps: UpdateSonarrSeriesDeps,
): Promise<SonarrSeries> {
  const { client, library } = deps;

  const resolvedUpdate = await resolveSonarrSeriesUpdate({
    api: client,
    credentials: input.credentials,
    defaults: input.defaults,
    form: input.form,
    title: input.title,
    tvdbId: input.tvdbId,
  });

  const updated = await client.updateSeries(
    resolvedUpdate.seriesId,
    resolvedUpdate.payload,
    input.credentials,
    { moveFiles: resolvedUpdate.moveFiles },
  );

  await library.addSeriesToCache(updated);
  return updated;
}
