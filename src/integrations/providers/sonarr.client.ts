/** Sonarr transport client for raw Arr API requests and mutations. */
// src/integrations/providers/sonarr.client.ts

import { BaseProviderClient } from '@/integrations/providers/base-provider.client';
import type { SonarrMonitorOption, SonarrSeriesType } from '@/shared/schemas/providers/sonarr-settings.schema';
import type {
  ProviderTag,
  ProviderCredentials,
  ProviderQualityProfile,
  ProviderRootFolder,
  SonarrLookupSeries,
  SonarrSeries,
} from '@/integrations/providers';
import { createError, ErrorCode } from '@/shared/errors';

type SonarrClientOptions = {
  hasUrlPermission: (url: string) => Promise<boolean>;
};

export interface AddSonarrSeriesPayload {
  title: string;
  tvdbId: number;
  qualityProfileId: number;
  rootFolderPath: string;
  seasonFolder: boolean;
  monitored: boolean;
  seriesType: SonarrSeriesType;
  tags: number[];
  addOptions: {
    monitor: SonarrMonitorOption;
    searchForMissingEpisodes: boolean;
    searchForCutoffUnmetEpisodes: boolean;
  };
}

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
    payload: AddSonarrSeriesPayload,
    credentials: ProviderCredentials,
  ): Promise<SonarrSeries> => {
    this.log.debug('Sending addSeries payload to Sonarr:', payload);
    const created = await this.request<SonarrSeries>('series', credentials, {
      method: 'POST',
      body: JSON.stringify(payload),
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
  ): Promise<ProviderRootFolder[]> => {
    return this.request<ProviderRootFolder[]>('rootfolder', credentials);
  };

  public getQualityProfiles = async (
    credentials: ProviderCredentials,
  ): Promise<ProviderQualityProfile[]> => {
    return this.request<ProviderQualityProfile[]>('qualityprofile', credentials);
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
}
