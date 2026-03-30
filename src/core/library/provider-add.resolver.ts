/** Builds final provider add payloads from app inputs, defaults, and provider tag state. */
// src/core/library/provider-add.resolver.ts

import type { AddRadarrMoviePayload, RadarrClient } from '@/integrations/providers/radarr.client';
import type { AddSonarrSeriesPayload, SonarrClient } from '@/integrations/providers/sonarr.client';
import type { RadarrFormState } from '@/shared/schemas/providers/radarr-settings.schema';
import type { SonarrFormState } from '@/shared/schemas/providers/sonarr-settings.schema';
import type { ProviderCredentials } from '@/shared/types/providers';
import {
  resolveMutationTagIds,
  resolveRequiredQualityProfileId,
  resolveRequiredRootFolderPath,
} from './provider-mutation.resolver';

type ResolveSonarrAddPayloadInput = {
  api: Pick<SonarrClient, 'getTags' | 'createTag'>;
  credentials: ProviderCredentials;
  defaults: SonarrFormState;
  form: SonarrFormState;
  title: string;
  tvdbId: number;
};

type ResolveRadarrAddPayloadInput = {
  api: Pick<RadarrClient, 'getTags' | 'createTag'>;
  credentials: ProviderCredentials;
  defaults: RadarrFormState;
  form: RadarrFormState;
  title: string;
  tmdbId: number;
  year?: number;
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
