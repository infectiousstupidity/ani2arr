/** Workflow that resolves AniList mapping, builds payload, and adds a Sonarr series. */
// src/core/library/add-sonarr-series.ts

import { resolveSonarrAddPayload } from '@/core/library/provider-add.resolver';
import type { SonarrClient } from '@/integrations/providers/sonarr.client';
import type { SonarrLibrary } from '@/services/library/sonarr';
import type { MappingService } from '@/services/mapping';
import type { ResolveTvdbIdOptions } from '@/services/mapping/types';
import { createError, ErrorCode } from '@/shared/errors';
import type { SonarrFormState } from '@/shared/schemas/providers/sonarr-settings.schema';
import type { AniListMediaHint } from '@/shared/types';
import type { ProviderCredentials, SonarrSeries } from '@/shared/types/providers';

type AddSonarrSeriesInput = {
  anilistId: number;
  title: string;
  primaryTitleHint?: string;
  metadata?: AniListMediaHint | null;
  form: SonarrFormState;
  defaults: SonarrFormState;
  credentials: ProviderCredentials;
};

type AddSonarrSeriesDeps = {
  client: Pick<SonarrClient, 'addSeries' | 'getTags' | 'createTag'>;
  mappingService: Pick<MappingService, 'resolveTvdbId'>;
  library: Pick<SonarrLibrary, 'addSeriesToCache'>;
};

export async function addSonarrSeries(
  input: AddSonarrSeriesInput,
  deps: AddSonarrSeriesDeps,
): Promise<SonarrSeries> {
  const { client, mappingService, library } = deps;

  const resolveOptions: ResolveTvdbIdOptions = { ignoreFailureCache: true };
  const hints: NonNullable<ResolveTvdbIdOptions['hints']> = {};
  if (input.primaryTitleHint) hints.primaryTitle = input.primaryTitleHint;
  if (input.metadata) hints.domMedia = input.metadata;
  if (Object.keys(hints).length > 0) resolveOptions.hints = hints;

  const mapping = await mappingService.resolveTvdbId(input.anilistId, resolveOptions);
  if (!mapping) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      `Could not resolve AniList ID ${input.anilistId} to a TVDB ID.`,
      'Unable to add this series to Sonarr because no matching TVDB entry was found.',
    );
  }

  const payload = await resolveSonarrAddPayload({
    api: client,
    credentials: input.credentials,
    defaults: input.defaults,
    form: input.form,
    title: input.title,
    tvdbId: mapping.tvdbId,
  });

  const created = await client.addSeries(payload, input.credentials);
  await library.addSeriesToCache(created);
  return created;
}
