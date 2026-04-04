/** Sonarr-only add payload builder for provider library mutations. */
// src/providers/library/sonarr-add-payload.ts

import type { AddSonarrSeriesPayload, SonarrClient } from '@/providers/clients/sonarr.client';
import type { SonarrFormState } from '@/providers/settings/sonarr-settings.schema';
import type { ProviderCredentials } from '@/providers';
import {
  resolveMutationTagIds,
  resolveRequiredQualityProfileId,
  resolveRequiredRootFolderPath,
} from './mutation-helpers';

type ResolveSonarrAddPayloadInput = {
  api: Pick<SonarrClient, 'getTags' | 'createTag'>;
  credentials: ProviderCredentials;
  defaults: SonarrFormState;
  form: SonarrFormState;
  title: string;
  tvdbId: number;
};

export async function resolveSonarrAddPayload(
  input: ResolveSonarrAddPayloadInput,
): Promise<AddSonarrSeriesPayload> {
  const { api, credentials, defaults, form, title, tvdbId } = input;

  const qualityProfileId = resolveRequiredQualityProfileId({
    value: form.qualityProfileId,
    fallback: defaults.qualityProfileId,
    providerLabel: 'Sonarr',
    entityLabel: 'series',
    actionLabel: 'add',
  });

  const rootFolderPath = resolveRequiredRootFolderPath({
    value: form.rootFolderPath,
    fallback: defaults.rootFolderPath,
    providerLabel: 'Sonarr',
    entityLabel: 'series',
    actionLabel: 'add',
  });

  const tags = await resolveMutationTagIds(
    api,
    credentials,
    form.tags,
    form.freeformTags,
    'Sonarr',
  );

  return {
    title,
    tvdbId,
    qualityProfileId,
    rootFolderPath,
    seasonFolder: form.seasonFolder,
    monitored: form.monitorOption !== 'none',
    seriesType: form.seriesType,
    tags,
    addOptions: {
      monitor: form.monitorOption,
      searchForMissingEpisodes: form.searchForMissingEpisodes,
      searchForCutoffUnmetEpisodes: form.searchForCutoffUnmetEpisodes,
    },
  };
}
