import { setupServer } from 'msw/node';
import { http, HttpResponse, type DefaultBodyType, type HttpHandler } from 'msw';
import {
  createAniGraphqlErrorPayload,
  createAniGraphqlSuccessPayload,
  createAniMediaFixture,
  createMappingHeaders,
  createSonarrLookupFixture,
  createSonarrQualityProfileFixture,
  createSonarrRootFolderFixture,
  createSonarrSeriesFixture,
  createSonarrTagFixture,
  createStaticMappingPayload,
  defaultSonarrCredentials,
  defaultSonarrUrl,
  fallbackMappingUrl,
  primaryMappingUrl,
} from './fixtures';
import type { AniMedia } from '@/api/anilist.api';
import type {
  SonarrLookupSeries,
  SonarrQualityProfile,
  SonarrRootFolder,
  SonarrSeries,
  SonarrTag,
} from '@/types';
import type { StaticMappingPayload } from '@/services/mapping.service';

export const testServer = setupServer();

const wait = async (delayMs?: number): Promise<void> => {
  if (delayMs === undefined) return;
  await new Promise<void>(resolve => {
    setTimeout(resolve, delayMs);
  });
};

export type JsonResponseOptions<T extends DefaultBodyType> = {
  body?: T;
  status?: number;
  delayMs?: number;
  headers?: Record<string, string>;
};

const createJsonResponse = async <T extends DefaultBodyType>(
  body: T,
  { status = 200, delayMs, headers = {} }: JsonResponseOptions<T> = {},
): Promise<HttpResponse<T>> => {
  await wait(delayMs);
  return HttpResponse.json(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  }) as HttpResponse<T>;
};

export const withLatency = <T extends DefaultBodyType>(delayMs: number): JsonResponseOptions<T> => ({ delayMs });
export const withStatus = <T extends DefaultBodyType>(status: number): JsonResponseOptions<T> => ({ status });
export const withHeaders = <T extends DefaultBodyType>(headers: Record<string, string>): JsonResponseOptions<T> => ({ headers });
export const withEtag = <T extends DefaultBodyType>(etag: string): JsonResponseOptions<T> => ({ headers: { ETag: etag } });
export const withRetryAfterSeconds = <T extends DefaultBodyType>(seconds: number): JsonResponseOptions<T> => ({
  headers: { 'Retry-After': seconds.toString() },
});

type ResponseConfig<
  T extends DefaultBodyType,
  TExtra extends Record<string, unknown> = Record<string, never>,
> = JsonResponseOptions<T> & TExtra;

const mergeResponseConfig = <
  T extends DefaultBodyType,
  TExtra extends Record<string, unknown>,
>(
  defaults: ResponseConfig<T, TExtra>,
  overrides: Partial<ResponseConfig<T, TExtra>> = {},
): ResponseConfig<T, TExtra> => ({
  ...defaults,
  ...overrides,
  headers: { ...defaults.headers, ...overrides.headers },
});

export const createAniListHandlers = (
  options: (JsonResponseOptions<{ data: { Media: AniMedia } }> & { media?: AniMedia }) = {},
): HttpHandler[] => {
  const { media = createAniMediaFixture(), body, status, delayMs, headers } = options;
  const payload = body ?? createAniGraphqlSuccessPayload(media);
  const responseOptions: JsonResponseOptions<typeof payload> = {};
  if (typeof status !== 'undefined') {
    responseOptions.status = status;
  }
  if (typeof delayMs !== 'undefined') {
    responseOptions.delayMs = delayMs;
  }
  if (headers) {
    responseOptions.headers = headers;
  }

  return [
    http.post('https://graphql.anilist.co', async () => {
      return createJsonResponse(payload, responseOptions);
    }),
  ];
};

export const createAniListErrorHandler = (
  message = 'AniList failure',
  status = 500,
  options: JsonResponseOptions<{ errors: { message: string; status: number }[] }> = {},
): HttpHandler => {
  const defaults: JsonResponseOptions<{ errors: { message: string; status: number }[] }> = {
    body: createAniGraphqlErrorPayload(message, status),
    status,
  };
  const resolved = mergeResponseConfig(defaults, options);
  return http.post('https://graphql.anilist.co', async () => {
    return createJsonResponse(resolved.body ?? createAniGraphqlErrorPayload(message, status), resolved);
  });
};

export type SonarrSeriesHandlerOptions = JsonResponseOptions<SonarrSeries[]> & {
  series?: SonarrSeries[];
};

export const createSonarrSeriesHandler = (
  options: SonarrSeriesHandlerOptions = {},
): HttpHandler => {
  const defaults: SonarrSeriesHandlerOptions = {
    series: [createSonarrSeriesFixture()],
    status: 200,
  };
  const resolved = mergeResponseConfig(defaults, options);
  const series = resolved.series ?? defaults.series!;

  return http.get(`${defaultSonarrUrl.replace(/\/$/, '')}/api/v3/series`, async ({ request }) => {
    const url = new URL(request.url);
    const tvdbIdParam = url.searchParams.get('tvdbId');
    const responseBody = tvdbIdParam
      ? series.filter(item => item.tvdbId === Number(tvdbIdParam))
      : series;
    return createJsonResponse(responseBody, resolved);
  });
};

export type SonarrLookupHandlerOptions = JsonResponseOptions<SonarrLookupSeries[]> & {
  results?: SonarrLookupSeries[];
};

export const createSonarrLookupHandler = (
  options: SonarrLookupHandlerOptions = {},
): HttpHandler => {
  const defaults: SonarrLookupHandlerOptions = {
    results: [createSonarrLookupFixture()],
  };
  const resolved = mergeResponseConfig(defaults, options);
  const results = resolved.results ?? defaults.results!;
  return http.get(`${defaultSonarrUrl.replace(/\/$/, '')}/api/v3/series/lookup`, async () => {
    return createJsonResponse(results, resolved);
  });
};

export const createSonarrRootFolderHandler = (
  options: JsonResponseOptions<SonarrRootFolder[]> & { folders?: SonarrRootFolder[] } = {},
): HttpHandler => {
  const defaults = {
    folders: [createSonarrRootFolderFixture()],
  };
  const resolved = mergeResponseConfig(defaults, options);
  const folders = resolved.folders ?? defaults.folders!;
  return http.get(`${defaultSonarrUrl.replace(/\/$/, '')}/api/v3/rootfolder`, async () => {
    return createJsonResponse(folders, resolved);
  });
};

export const createSonarrQualityProfileHandler = (
  options: JsonResponseOptions<SonarrQualityProfile[]> & { profiles?: SonarrQualityProfile[] } = {},
): HttpHandler => {
  const defaults = {
    profiles: [createSonarrQualityProfileFixture()],
  };
  const resolved = mergeResponseConfig(defaults, options);
  const profiles = resolved.profiles ?? defaults.profiles!;
  return http.get(`${defaultSonarrUrl.replace(/\/$/, '')}/api/v3/qualityprofile`, async () => {
    return createJsonResponse(profiles, resolved);
  });
};

export const createSonarrTagHandler = (
  options: JsonResponseOptions<SonarrTag[]> & { tags?: SonarrTag[] } = {},
): HttpHandler => {
  const defaults = {
    tags: [createSonarrTagFixture()],
  };
  const resolved = mergeResponseConfig(defaults, options);
  const tags = resolved.tags ?? defaults.tags!;
  return http.get(`${defaultSonarrUrl.replace(/\/$/, '')}/api/v3/tag`, async () => {
    return createJsonResponse(tags, resolved);
  });
};

export const createSonarrStatusHandler = (
  version = '4.0.0.0',
  options: JsonResponseOptions<{ version: string }> = {},
): HttpHandler => {
  const defaults: JsonResponseOptions<{ version: string }> = {
    body: { version },
  };
  const resolved = mergeResponseConfig(defaults, options);
  return http.get(`${defaultSonarrUrl.replace(/\/$/, '')}/api/v3/system/status`, async () => {
    return createJsonResponse(resolved.body ?? { version }, resolved);
  });
};

export const createSonarrAddSeriesHandler = (
  options: JsonResponseOptions<SonarrSeries> & { response?: SonarrSeries } = {},
): HttpHandler => {
  const defaults = {
    response: createSonarrSeriesFixture(),
    status: 201,
  };
  const resolved = mergeResponseConfig(defaults, options);
  const response = resolved.response ?? defaults.response!;
  return http.post(`${defaultSonarrUrl.replace(/\/$/, '')}/api/v3/series`, async () => {
    return createJsonResponse(response, resolved);
  });
};

export const createSonarrDeleteSeriesHandler = (
  options: JsonResponseOptions<Record<string, never>> = {},
): HttpHandler => {
  const defaults: JsonResponseOptions<Record<string, never>> = {
    body: {},
    status: 204,
  };
  const resolved = mergeResponseConfig(defaults, options);
  return http.delete(`${defaultSonarrUrl.replace(/\/$/, '')}/api/v3/series`, async ({ request }) => {
    const url = new URL(request.url);
    const responseBody = resolved.body ?? {};
    if (url.searchParams.size > 0 && resolved.status === undefined) {
      resolved.status = 200;
    }
    return createJsonResponse(responseBody, resolved);
  });
};

export const createStaticMappingHandler = (
  source: 'primary' | 'fallback',
  options: JsonResponseOptions<StaticMappingPayload> = {},
): HttpHandler => {
  const url = source === 'primary' ? primaryMappingUrl : fallbackMappingUrl;
  const defaults: JsonResponseOptions<StaticMappingPayload> = {
    body: createStaticMappingPayload(),
    headers: createMappingHeaders(),
  };
  const resolved = mergeResponseConfig(defaults, options);
  return http.get(url, async () => {
    return createJsonResponse(resolved.body ?? createStaticMappingPayload(), resolved);
  });
};

export const defaultTestHandlers: HttpHandler[] = [
  ...createAniListHandlers(),
  createSonarrSeriesHandler(),
  createSonarrLookupHandler(),
  createSonarrRootFolderHandler(),
  createSonarrQualityProfileHandler(),
  createSonarrTagHandler(),
  createSonarrStatusHandler(),
  createSonarrAddSeriesHandler(),
  createStaticMappingHandler('primary'),
  createStaticMappingHandler('fallback'),
];

export const resetDefaultTestHandlers = (): void => {
  testServer.resetHandlers(...defaultTestHandlers);
};

export { defaultSonarrCredentials };
