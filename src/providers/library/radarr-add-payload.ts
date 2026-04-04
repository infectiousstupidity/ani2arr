/** Radarr-only add payload builder for provider library mutations. */
// src/providers/library/radarr-add-payload.ts

import type { AddRadarrMoviePayload, RadarrClient } from '@/providers/clients/radarr.client';
import type { RadarrFormState } from '@/providers/settings/radarr-settings.schema';
import type { ProviderCredentials } from '@/providers';
import {
  resolveMutationTagIds,
  resolveRequiredQualityProfileId,
  resolveRequiredRootFolderPath,
} from './mutation-helpers';

type ResolveRadarrAddPayloadInput = {
  api: Pick<RadarrClient, 'getTags' | 'createTag'>;
  credentials: ProviderCredentials;
  defaults: RadarrFormState;
  form: RadarrFormState;
  title: string;
  tmdbId: number;
  year?: number;
};

export async function resolveRadarrAddPayload(
  input: ResolveRadarrAddPayloadInput,
): Promise<AddRadarrMoviePayload> {
  const { api, credentials, defaults, form, title, tmdbId, year } = input;

  const qualityProfileId = resolveRequiredQualityProfileId({
    value: form.qualityProfileId,
    fallback: defaults.qualityProfileId,
    providerLabel: 'Radarr',
    entityLabel: 'movie',
    actionLabel: 'add',
  });

  const rootFolderPath = resolveRequiredRootFolderPath({
    value: form.rootFolderPath,
    fallback: defaults.rootFolderPath,
    providerLabel: 'Radarr',
    entityLabel: 'movie',
    actionLabel: 'add',
  });

  const tags = await resolveMutationTagIds(
    api,
    credentials,
    form.tags,
    form.freeformTags,
    'Radarr',
  );

  return {
    title,
    tmdbId,
    qualityProfileId,
    rootFolderPath,
    monitored: form.monitored,
    minimumAvailability: form.minimumAvailability,
    tags,
    ...(typeof year === 'number' ? { year } : {}),
    addOptions: {
      searchForMovie: form.searchForMovie,
    },
  };
}
