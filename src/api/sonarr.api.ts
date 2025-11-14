// src/api/sonarr.api.ts

import { withRetry, AbortError } from '@/shared/utils/retry';
import { hasSonarrPermission } from '@/shared/utils/validation';
import type {
  ExtensionOptions,
  SonarrCredentialsPayload,
  SonarrSeries,
  SonarrRootFolder,
  SonarrQualityProfile,
  AddRequestPayload,
  SonarrTag,
  SonarrLookupSeries,
} from '@/shared/types';
import { createError, ErrorCode, logError, normalizeError } from '@/shared/utils/error-handling';
import { logger } from '@/shared/utils/logger';

const log = logger.create('SonarrApiService');

export class SonarrApiService {
  // Simple in-memory ETag cache for common read endpoints
  private readonly etagCache: Map<string, { etag: string; json: unknown }> = new Map();
  private readonly cacheableEndpoints = new Set<string>(['series', 'qualityprofile', 'rootfolder', 'tag']);

  /** Clears all cached ETags and associated payloads. Call on settings changes. */
  public clearEtagCache(): void {
    this.etagCache.clear();
  }

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

    const baseUrl = `${credentials.url.replace(/\/$/, '')}/api/v3/${endpoint}`;

    try {
      return await withRetry(
        async () => {
          // Always authenticate with header; avoid leaking API key in URLs
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);

          // Determine if this request is cacheable (GET + no query + in whitelist)
          const method = (fetchOptions.method ?? 'GET').toString().toUpperCase();
          const normalizedEndpoint = endpoint.split('?')[0] ?? endpoint;
          const cacheKey = normalizedEndpoint;
          const isCacheable = method === 'GET' && this.cacheableEndpoints.has(normalizedEndpoint) && endpoint === normalizedEndpoint;

          const init: RequestInit = {
            ...fetchOptions,
            headers: {
              ...(fetchOptions.headers ?? {}),
              ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
              'X-Api-Key': credentials.apiKey,
              ...(isCacheable && this.etagCache.has(cacheKey)
                ? { 'If-None-Match': this.etagCache.get(cacheKey)!.etag }
                : {}),
            },
            referrerPolicy: 'no-referrer',
            credentials: 'omit',
            signal: controller.signal,
          };

          let response: Response;
          try {
            response = await fetch(baseUrl, init);
          } finally {
            clearTimeout(timeout);
          }

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

            // Try to parse Sonarr error body for better diagnostics
            let detail: unknown;
            try {
              detail = await response.clone().json();
            } catch {
              // ignore
            }

            const baseMessage = `Sonarr API Error: ${response.status} ${response.statusText}`;
            const err = new Error(baseMessage) as Error & { retryAfterMs?: number; detail?: unknown };
            if (retryAfterMs !== undefined) err.retryAfterMs = retryAfterMs;
            if (detail !== undefined) err.detail = detail;

            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
              // Abort further retries for client errors (except 429 which is rate-limit)
              throw new AbortError(err.message);
            }
            throw err;
          }

          // If the server indicates content not modified, return cached body
          if (response.status === 304 && isCacheable) {
            const cached = this.etagCache.get(cacheKey)?.json as T | undefined;
            if (cached !== undefined) return cached;
            // fall through to parse if cache missing (shouldn't happen)
          }

          if (response.status === 204) return {} as T;

          const isJson = response.headers.get('content-type')?.includes('application/json');
          const data = (isJson ? ((await response.json()) as T) : ({} as T));

          // Store fresh ETag and body for cacheable reads
          if (isCacheable && isJson) {
            const nextEtag = response.headers.get('ETag');
            if (nextEtag) {
              this.etagCache.set(cacheKey, { etag: nextEtag, json: data });
            }
          }

          return data;
        },
        {
          retries: 3,
          extractRetryAfterMs: (e: unknown) => (e as { retryAfterMs?: number })?.retryAfterMs,
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
    const qs = new URLSearchParams({ tvdbId: String(tvdbId) }).toString();
    const seriesArray = await this.request<SonarrSeries[]>(`series?${qs}`, credentials);
    return seriesArray[0] ?? null;
  };

  public lookupSeriesByTerm = async (
    term: string,
    credentials: SonarrCredentialsPayload,
  ): Promise<SonarrLookupSeries[]> => {
    const qs = new URLSearchParams({ term }).toString();
    return this.request<SonarrLookupSeries[]>(`series/lookup?${qs}`, credentials);
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
      addOptions: {
        searchForMissingEpisodes:
          finalPayload.searchForMissingEpisodes ?? baseOptions.defaults.searchForMissingEpisodes,
        monitor: finalPayload.monitorOption ?? baseOptions.defaults.monitorOption,
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
