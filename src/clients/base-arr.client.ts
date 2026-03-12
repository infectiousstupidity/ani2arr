import { createError, ErrorCode, logError, normalizeError } from '@/shared/errors/error-utils';
import { logger } from '@/shared/utils/logger';
import { AbortError, withRetry } from '@/shared/utils/retry';

export interface ArrCredentials {
  url: string;
  apiKey: string;
}

interface BaseArrClientOptions {
  serviceName: string;
  logScope?: string;
  apiBasePath?: string;
  timeoutMs?: number;
  cacheableEndpoints?: Iterable<string>;
  hasPermission: (url: string) => Promise<boolean>;
}

type CachedResponse = {
  etag: string;
  json: unknown;
};

export class BaseArrClient {
  protected readonly log;

  private readonly serviceName: string;
  private readonly apiBasePath: string;
  private readonly timeoutMs: number;
  private readonly hasPermission: (url: string) => Promise<boolean>;
  private readonly etagCache = new Map<string, CachedResponse>();
  private readonly cacheableEndpoints: Set<string>;

  public constructor(options: BaseArrClientOptions) {
    this.serviceName = options.serviceName;
    this.apiBasePath = this.normalizeApiBasePath(options.apiBasePath ?? '/api/v3');
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.hasPermission = options.hasPermission;
    this.cacheableEndpoints = new Set(options.cacheableEndpoints ?? []);
    this.log = logger.create(options.logScope ?? `${options.serviceName}ApiService`);
  }

  public clearEtagCache(): void {
    this.etagCache.clear();
  }

  protected invalidateCachedEndpoint(endpoint: string): void {
    this.etagCache.delete(this.normalizeEndpoint(endpoint));
  }

  protected async request<T>(
    endpoint: string,
    credentials: ArrCredentials,
    fetchOptions: RequestInit = {},
  ): Promise<T> {
    if (!credentials.url || !credentials.apiKey) {
      throw createError(
        ErrorCode.CONFIGURATION_ERROR,
        `${this.serviceName} URL or API Key not provided.`,
        `${this.serviceName} URL or API Key is missing.`,
      );
    }

    if (!(await this.hasPermission(credentials.url))) {
      throw createError(
        ErrorCode.PERMISSION_ERROR,
        `Missing permission for ${this.serviceName} URL: ${credentials.url}`,
        `Permission for the ${this.serviceName} URL is required. Please grant access in the extension options.`,
      );
    }

    const requestUrl = this.buildRequestUrl(credentials.url, endpoint);

    try {
      return await withRetry(
        async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

          const method = (fetchOptions.method ?? 'GET').toString().toUpperCase();
          const normalizedEndpoint = this.normalizeEndpoint(endpoint);
          const cacheKey = normalizedEndpoint;
          const isCacheable =
            method === 'GET' &&
            this.cacheableEndpoints.has(normalizedEndpoint) &&
            endpoint === normalizedEndpoint;

          const headers = new Headers(fetchOptions.headers ?? undefined);
          if (fetchOptions.body) {
            headers.set('Content-Type', 'application/json');
          }
          headers.set('X-Api-Key', credentials.apiKey);
          if (isCacheable && this.etagCache.has(cacheKey)) {
            headers.set('If-None-Match', this.etagCache.get(cacheKey)!.etag);
          }

          const init: RequestInit = {
            ...fetchOptions,
            headers,
            referrerPolicy: 'no-referrer',
            credentials: 'omit',
            signal: controller.signal,
          };

          let response: Response;
          try {
            response = await fetch(requestUrl, init);
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

            let detail: unknown;
            try {
              detail = await response.clone().json();
            } catch {
              // ignore non-JSON errors
            }

            const baseMessage = `${this.serviceName} API Error: ${response.status} ${response.statusText}`;
            const err = new Error(baseMessage) as Error & {
              retryAfterMs?: number;
              detail?: unknown;
            };
            if (retryAfterMs !== undefined) err.retryAfterMs = retryAfterMs;
            if (detail !== undefined) err.detail = detail;

            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
              throw new AbortError(err.message);
            }
            throw err;
          }

          if (response.status === 304 && isCacheable) {
            const cached = this.etagCache.get(cacheKey)?.json as T | undefined;
            if (cached !== undefined) return cached;
          }

          if (response.status === 204) {
            return {} as T;
          }

          const isJson = response.headers.get('content-type')?.includes('application/json');
          const data = isJson ? ((await response.json()) as T) : ({} as T);

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
          extractRetryAfterMs: error => (error as { retryAfterMs?: number })?.retryAfterMs,
        },
      );
    } catch (error) {
      const normalized = normalizeError(error);
      logError(normalized, `${this.serviceName}ApiService:request:${endpoint}`);
      throw normalized;
    }
  }

  private buildRequestUrl(baseUrl: string, endpoint: string): string {
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
    const normalizedEndpoint = endpoint.replace(/^\/+/, '');
    return `${normalizedBaseUrl}${this.apiBasePath}/${normalizedEndpoint}`;
  }

  private normalizeApiBasePath(apiBasePath: string): string {
    const trimmed = apiBasePath.trim();
    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeadingSlash.replace(/\/+$/, '');
  }

  private normalizeEndpoint(endpoint: string): string {
    const [path] = endpoint.split('?');
    return path ?? endpoint;
  }
}
