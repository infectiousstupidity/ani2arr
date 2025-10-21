// src/api/sonarr.api.ts

import PRetry, { AbortError } from 'p-retry';
import { hasSonarrPermission } from '@/utils/validation';
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
      return await PRetry(
        async () => {
          const response = await fetch(url, {
            ...fetchOptions,
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': credentials.apiKey,
              ...fetchOptions.headers,
            },
          });

          if (!response.ok) {
            const retryAfterHeader = response.headers.get('Retry-After');
            let retryAfterMs: number | undefined;

            if (response.status === 429 && retryAfterHeader) {
              const seconds = Number(retryAfterHeader);
              if (Number.isFinite(seconds)) {
                retryAfterMs = Math.max(0, seconds * 1000);
              } else {
                const parsedDate = Date.parse(retryAfterHeader);
                if (!Number.isNaN(parsedDate)) {
                  retryAfterMs = Math.max(0, parsedDate - Date.now());
                }
              }
            }

            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
              throw new AbortError(`Client error: ${response.status}`);
            }

            const err = new Error(`Sonarr API Error: ${response.status} ${response.statusText}`) as Error & {
              retryAfterMs?: number;
            };
            if (retryAfterMs !== undefined) {
              err.retryAfterMs = retryAfterMs;
            }
            throw err;
          }

          if (response.status === 204) {
            return {} as T;
          }

          const contentLength = response.headers.get('Content-Length');
          if (contentLength === '0') {
            return {} as T;
          }

          if (contentLength === null) {
            const rawBody = await response.clone().text();
            if (!rawBody.trim()) {
              return {} as T;
            }
          }

          return (await response.json()) as T;
        },
        {
          retries: 3,
          onFailedAttempt: async error => {
            const retryAfterMs = (error.error as unknown as Error & { retryAfterMs?: number })
              .retryAfterMs;
            if (retryAfterMs) {
              await new Promise(resolve => setTimeout(resolve, retryAfterMs));
            }
          },
        },
      );
    } catch (error) {
      const normalized = normalizeError(error);
      logError(normalized, `SonarrApiService:request:${endpoint}`);
      throw normalized;
    }
  };

  public getAllSeries = async (credentials: SonarrCredentialsPayload): Promise<SonarrSeries[]> => {
    return this.request<SonarrSeries[]>('series', credentials);
  };

  public getSeriesByTvdbId = async (
    tvdbId: number,
    credentials: SonarrCredentialsPayload,
  ): Promise<SonarrSeries | null> => {
    const seriesArray = await this.request<SonarrSeries[]>(`series?tvdbId=${tvdbId}`, credentials);
    return seriesArray[0] ?? null;
  };

  public lookupSeriesByTerm = async (
    term: string,
    credentials: SonarrCredentialsPayload,
  ): Promise<SonarrLookupSeries[]> => {
    const encodedTerm = encodeURIComponent(term);
    return this.request<SonarrLookupSeries[]>(`series/lookup?term=${encodedTerm}`, credentials);
  };

  public addSeries = async (payload: AddRequestPayload, baseOptions: ExtensionOptions): Promise<SonarrSeries> => {
    const sonarrCreds = { url: baseOptions.sonarrUrl, apiKey: baseOptions.sonarrApiKey };

    const finalPayload: AddRequestPayload = {
      ...baseOptions.defaults,
      ...payload,
    };
    const { metadata: _unusedMetadata, ...payloadForSonarr } = finalPayload;
    void _unusedMetadata;
    const apiPayload = {
      ...payloadForSonarr,
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
