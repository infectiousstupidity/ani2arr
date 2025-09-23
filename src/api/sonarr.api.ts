// src/api/sonarr.api.ts

import { hasSonarrPermission } from '@/utils/validation';
import { retryWithBackoff, RetriableError } from '@/utils/retry';
import type {
  ExtensionOptions,
  SonarrCredentialsPayload,
  SonarrSeries,
  SonarrRootFolder,
  SonarrQualityProfile,
  AddRequestPayload,
  SonarrTag,
  SonarrLookupSeries,
} from '@/types';
import { createError, ErrorCode, logError, normalizeError } from '@/utils/error-handling';
import { logger } from '@/utils/logger';

const log = logger.create('SonarrApiService');

export class SonarrApiService {
  private request = async <T>(
    endpoint: string,
    credentials: SonarrCredentialsPayload,
    fetchOptions: RequestInit = {},
  ): Promise<T> => {
    if (!credentials.url || !credentials.apiKey) {
      throw createError(
        ErrorCode.CONFIGURATION_ERROR,
        'Sonarr URL or API Key not provided.',
        'Sonarr URL or API Key is missing.',
      );
    }

    if (!(await hasSonarrPermission(credentials.url))) {
      throw createError(
        ErrorCode.PERMISSION_ERROR,
        `Missing permission for Sonarr URL: ${credentials.url}`,
        'Permission for the Sonarr URL is required. Please grant access in the extension options.',
      );
    }

    const url = `${credentials.url.replace(/\/$/, '')}/api/v3/${endpoint}`;

    try {
      return await retryWithBackoff(async () => {
        const response = await fetch(url, {
          ...fetchOptions,
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': credentials.apiKey,
            ...fetchOptions.headers,
          },
        });

        if (!response.ok) {
          throw new RetriableError(`Sonarr API Error: ${response.status} ${response.statusText}`, response.status);
        }

        if (response.status === 204 || response.headers.get('Content-Length') === '0') {
          return {} as T;
        }

        return (await response.json()) as T;
      });
    } catch (error) {
      const normalized = normalizeError(error);
      logError(normalized, `SonarrApiService:request:${endpoint}`);
      throw normalized;
    }
  };

  /** /series */
  public getAllSeries = async (credentials: SonarrCredentialsPayload): Promise<SonarrSeries[]> => {
    return this.request<SonarrSeries[]>('series', credentials);
  };

  /** /series?tvdbId=XYZ */
  public getSeriesByTvdbId = async (
    tvdbId: number,
    credentials: SonarrCredentialsPayload,
  ): Promise<SonarrSeries | null> => {
    const seriesArray = await this.request<SonarrSeries[]>(`series?tvdbId=${tvdbId}`, credentials);
    return seriesArray[0] ?? null;
  };

  /** /series/lookup?term=... */
  public lookupSeriesByTerm = async (
    term: string,
    credentials: SonarrCredentialsPayload,
  ): Promise<SonarrLookupSeries[]> => {
    const encodedTerm = encodeURIComponent(term);
    return this.request<SonarrLookupSeries[]>(`series/lookup?term=${encodedTerm}`, credentials);
  };

  /** POST /series */
  public addSeries = async (payload: AddRequestPayload, baseOptions: ExtensionOptions): Promise<SonarrSeries> => {
    const sonarrCreds = { url: baseOptions.sonarrUrl, apiKey: baseOptions.sonarrApiKey };

    const finalPayload: AddRequestPayload = {
      ...baseOptions.defaults,
      ...payload,
    };
    const apiPayload = {
      ...finalPayload,
      monitored: (finalPayload.monitorOption ?? baseOptions.defaults.monitorOption) !== 'none',
      monitoringOptions: {
        monitor: finalPayload.monitorOption ?? baseOptions.defaults.monitorOption,
      },
      addOptions: {
        searchForMissingEpisodes:
          finalPayload.searchForMissingEpisodes ?? baseOptions.defaults.searchForMissingEpisodes,
      },
    };

    log.debug('Sending addSeries payload to Sonarr:', apiPayload);
    return this.request<SonarrSeries>('series', sonarrCreds, {
      method: 'POST',
      body: JSON.stringify(apiPayload),
    });
  };

  public getRootFolders = async (credentials: SonarrCredentialsPayload): Promise<SonarrRootFolder[]> => {
    return this.request<SonarrRootFolder[]>('rootfolder', credentials);
  };

  public getQualityProfiles = async (credentials: SonarrCredentialsPayload): Promise<SonarrQualityProfile[]> => {
    return this.request<SonarrQualityProfile[]>('qualityprofile', credentials);
  };

  public getTags = async (credentials: SonarrCredentialsPayload): Promise<SonarrTag[]> => {
    return this.request<SonarrTag[]>('tag', credentials);
  };

  public testConnection = async (credentials: SonarrCredentialsPayload): Promise<{ version: string }> => {
    return this.request<{ version: string }>('system/status', credentials);
  };
}
