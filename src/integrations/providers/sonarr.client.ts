/** Sonarr transport client for raw Arr API requests and mutations. */
// src/integrations/providers/sonarr.client.ts

import { BaseProviderClient } from '@/integrations/providers/base-provider.client';
import { resolveProviderTagIds } from '@/core/library/provider-tags.resolver';
import type {
  ExtensionOptions,
  ProviderTag,
  ProviderCredentials,
  SonarrSeries,
  SonarrRootFolder,
  SonarrQualityProfile,
  AddRequestPayload,
  SonarrLookupSeries,
} from '@/shared/types';
import { createError, ErrorCode } from '@/shared/errors';

type SonarrClientOptions = {
  hasUrlPermission: (url: string) => Promise<boolean>;
};

export class SonarrClient extends BaseProviderClient {
  public constructor(options: SonarrClientOptions) {
    super({
      providerName: 'Sonarr',
      logScope: 'SonarrClient',
      cacheableEndpoints: ['series', 'qualityprofile', 'rootfolder', 'tag'],
      hasUrlPermission: options.hasUrlPermission,
    });
  }

  public getAllSeries = async (credentials: ProviderCredentials): Promise<SonarrSeries[]> => {
    return this.request<SonarrSeries[]>('series', credentials);
  };

  public getSeriesByTvdbId = async (
    tvdbId: number,
    credentials: ProviderCredentials,
  ): Promise<SonarrSeries | null> => {
    const qs = new URLSearchParams({ tvdbId: String(tvdbId) }).toString();
    const seriesArray = await this.request<SonarrSeries[]>(`series?${qs}`, credentials);
    return seriesArray[0] ?? null;
  };

  public lookupSeriesByTvdbId = async (
    tvdbId: number,
    credentials: ProviderCredentials,
  ): Promise<SonarrLookupSeries | null> => {
    const hits = await this.lookupSeriesByTerm(`tvdb:${tvdbId}`, credentials);
    return hits.find(hit => hit?.tvdbId === tvdbId) ?? null;
  };

  public getSeriesById = async (
    seriesId: number,
    credentials: ProviderCredentials,
  ): Promise<SonarrSeries> => {
    return this.request<SonarrSeries>(`series/${seriesId}`, credentials);
  };

  public lookupSeriesByTerm = async (
    term: string,
    credentials: ProviderCredentials,
  ): Promise<SonarrLookupSeries[]> => {
    const qs = new URLSearchParams({ term }).toString();
    return this.request<SonarrLookupSeries[]>(`series/lookup?${qs}`, credentials);
  };

  public addSeries = async (
    payload: AddRequestPayload,
    extensionOptions: ExtensionOptions,
  ): Promise<SonarrSeries> => {
    const sonarrSettings = extensionOptions.providers.sonarr;
    const sonarrCreds: ProviderCredentials = {
      url: sonarrSettings.url,
      apiKey: sonarrSettings.apiKey,
    };

    const mergedInput: AddRequestPayload = {
      ...sonarrSettings.defaults,
      ...payload,
    };

    const finalTagIds = await resolveProviderTagIds({
      api: this,
      credentials: sonarrCreds,
      existingIdsFromForm: Array.isArray(mergedInput.tags)
        ? mergedInput.tags.filter(id => typeof id === 'number' && !Number.isNaN(id))
        : [],
      freeformLabelsFromForm: Array.isArray(mergedInput.freeformTags) ? mergedInput.freeformTags : [],
      serviceLabel: 'Sonarr',
    });

    // Strip fields that Sonarr does not understand (`metadata`, `freeformTags`) before sending
    const {
      metadata: _unusedMetadata,
      freeformTags: _unusedFreeformTags,
      ...payloadForSonarr
    } = mergedInput;
    void _unusedMetadata;
    void _unusedFreeformTags;

    const apiPayload = {
      ...payloadForSonarr,
      tags: finalTagIds,
      monitored:
        (mergedInput.monitorOption ?? sonarrSettings.defaults.monitorOption) !== 'none',
      addOptions: {
        searchForMissingEpisodes:
          mergedInput.searchForMissingEpisodes ??
          sonarrSettings.defaults.searchForMissingEpisodes,
        searchForCutoffUnmetEpisodes:
          mergedInput.searchForCutoffUnmetEpisodes ??
          sonarrSettings.defaults.searchForCutoffUnmetEpisodes,
        monitor: mergedInput.monitorOption ?? sonarrSettings.defaults.monitorOption,
      },
    };

    this.log.debug('Sending addSeries payload to Sonarr:', apiPayload);
    const created = await this.request<SonarrSeries>('series', sonarrCreds, {
      method: 'POST',
      body: JSON.stringify(apiPayload),
    });

    return created;
  };

  public updateSeries = async (
    seriesId: number,
    payload: SonarrSeries,
    credentials: ProviderCredentials,
    options?: { moveFiles?: boolean },
  ): Promise<SonarrSeries> => {
    const qs = new URLSearchParams();
    if (options?.moveFiles) {
      qs.set('moveFiles', 'true');
    }
    const endpoint = qs.size > 0 ? `series/${seriesId}?${qs.toString()}` : `series/${seriesId}`;

    this.log.debug('Sending updateSeries payload to Sonarr:', {
      seriesId,
      moveFiles: options?.moveFiles,
      payload,
    });
    return this.request<SonarrSeries>(endpoint, credentials, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  };

  public getRootFolders = async (
    credentials: ProviderCredentials,
  ): Promise<SonarrRootFolder[]> => {
    return this.request<SonarrRootFolder[]>('rootfolder', credentials);
  };

  public getQualityProfiles = async (
    credentials: ProviderCredentials,
  ): Promise<SonarrQualityProfile[]> => {
    return this.request<SonarrQualityProfile[]>('qualityprofile', credentials);
  };

  public getTags = async (credentials: ProviderCredentials): Promise<ProviderTag[]> => {
    return this.request<ProviderTag[]>('tag', credentials);
  };

  /**
   * Creates a new tag in Sonarr with the given label.
   * Returns the created provider tag (including its numeric id).
   */
  public createTag = async (
    credentials: ProviderCredentials,
    label: string,
  ): Promise<ProviderTag> => {
    const trimmed = label.trim();
    if (!trimmed) {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        'Tag label is empty.',
        'Tag label cannot be empty.',
      );
    }

    const created = await this.request<ProviderTag>('tag', credentials, {
      method: 'POST',
      body: JSON.stringify({ label: trimmed }),
    });

    // Tag list has changed; drop cached /tag response so the next getTags sees it.
    this.invalidateCachedEndpoint('tag');

    return created;
  };

  public testConnection = async (
    credentials: ProviderCredentials,
  ): Promise<{ version: string }> => {
    return this.request<{ version: string }>('system/status', credentials);
  };
}
