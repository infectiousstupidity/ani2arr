// src/api/__tests__/sonarr.api.test.ts
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { SonarrApiService } from '@/api/sonarr.api';
import type { AddRequestPayload, ExtensionOptions, SonarrCredentialsPayload } from '@/types';
import { ErrorCode } from '@/utils/error-handling';
import * as validation from '@/utils/validation';
import * as retry from '@/utils/retry';
import * as errorHandling from '@/utils/error-handling';

const BASE_CREDENTIALS: SonarrCredentialsPayload = {
  url: 'https://sonarr.local',
  apiKey: 'abc123',
};

describe('SonarrApiService', () => {
  let service: SonarrApiService;
  let fetchMock: ReturnType<typeof vi.fn>;
  let hasPermissionSpy: ReturnType<typeof vi.spyOn>;
  let retrySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    service = new SonarrApiService();
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    hasPermissionSpy = vi.spyOn(validation, 'hasSonarrPermission').mockResolvedValue(true);
    retrySpy = vi.spyOn(retry, 'retryWithBackoff').mockImplementation(async fn => fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('short-circuits when Sonarr credentials are missing', async () => {
    const attempt = service.getAllSeries({ url: '', apiKey: '' });

    await expect(attempt).rejects.toMatchObject({ code: ErrorCode.CONFIGURATION_ERROR });
    expect(retrySpy).not.toHaveBeenCalled();
    expect(hasPermissionSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('short-circuits when Sonarr permission is denied', async () => {
    hasPermissionSpy.mockResolvedValueOnce(false);

    const attempt = service.getAllSeries(BASE_CREDENTIALS);

    await expect(attempt).rejects.toMatchObject({ code: ErrorCode.PERMISSION_ERROR });
    expect(retrySpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('merges defaults with overrides and sets monitoring/add options on addSeries', async () => {
    const baseOptions: ExtensionOptions = {
      sonarrUrl: BASE_CREDENTIALS.url,
      sonarrApiKey: BASE_CREDENTIALS.apiKey,
      defaults: {
        qualityProfileId: 1,
        rootFolderPath: '/anime',
        seriesType: 'anime',
        monitorOption: 'all',
        seasonFolder: true,
        searchForMissingEpisodes: false,
        tags: [10],
      },
    };

    const payload: AddRequestPayload = {
      title: 'Trigun',
      anilistId: 5,
      tvdbId: 12345,
      seasonFolder: false,
      monitorOption: 'none',
      searchForMissingEpisodes: true,
      tags: [1, 2],
    };

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 777, title: 'Trigun', tvdbId: 12345, titleSlug: 'trigun' }), {
        status: 200,
      }),
    );

    await service.addSeries(payload, baseOptions);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sonarr.local/api/v3/series');

    const body = JSON.parse(String(requestInit?.body));
    expect(body).toMatchObject({
      title: 'Trigun',
      anilistId: 5,
      tvdbId: 12345,
      qualityProfileId: 1,
      rootFolderPath: '/anime',
      seriesType: 'anime',
      seasonFolder: false,
      monitorOption: 'none',
      tags: [1, 2],
      monitored: false,
      monitoringOptions: { monitor: 'none' },
      addOptions: { searchForMissingEpisodes: true },
    });
  });

  it('encodes lookup terms when requesting series by term', async () => {
    fetchMock.mockResolvedValueOnce(new Response('[]', { status: 200 }));

    await service.lookupSeriesByTerm('Fate/Zero & Friends', BASE_CREDENTIALS);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://sonarr.local/api/v3/series/lookup?term=Fate%2FZero%20%26%20Friends',
      expect.any(Object),
    );
  });

  it('returns an empty object for 204 responses', async () => {
    const request = (service as unknown as { request: SonarrApiService['request'] }).request.bind(service);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await request('series', BASE_CREDENTIALS);

    expect(result).toEqual({});
  });

  it('returns an empty object for empty successful responses', async () => {
    const request = (service as unknown as { request: SonarrApiService['request'] }).request.bind(service);
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));

    const result = await request('series', BASE_CREDENTIALS);

    expect(result).toEqual({});
  });

  it('normalizes and logs errors when Sonarr responds with a failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500, statusText: 'Server Error' }));

    const normalizedError = { code: ErrorCode.API_ERROR, message: 'bad', userMessage: 'nope', timestamp: Date.now() };
    const normalizeSpy = vi.spyOn(errorHandling, 'normalizeError').mockReturnValue(normalizedError);
    const logSpy = vi.spyOn(errorHandling, 'logError').mockImplementation(() => {});

    await expect(service.getAllSeries(BASE_CREDENTIALS)).rejects.toBe(normalizedError);

    expect(normalizeSpy).toHaveBeenCalledTimes(1);
    const thrown = normalizeSpy.mock.calls[0]?.[0];
    expect(thrown).toBeInstanceOf(retry.RetriableError);
    expect((thrown as retry.RetriableError).status).toBe(500);
    expect(logSpy).toHaveBeenCalledWith(normalizedError, 'SonarrApiService:request:series');
  });

  it('retries when Sonarr responds with retriable server errors', async () => {
    const firstResponse = new Response('fail', { status: 503, statusText: 'Service Unavailable' });
    const successBody = [
      { id: 1, title: 'Series', tvdbId: 9, titleSlug: 'series' },
    ];
    const secondResponse = new Response(JSON.stringify(successBody), { status: 200 });
    fetchMock
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse);

    let capturedError: unknown;
    retrySpy.mockImplementation(async fn => {
      try {
        return await fn();
      } catch (error) {
        capturedError = error;
        if (error instanceof retry.RetriableError && error.status && error.status >= 500) {
          return fn();
        }
        throw error;
      }
    });

    const result = await service.getAllSeries(BASE_CREDENTIALS);

    expect(capturedError).toBeInstanceOf(retry.RetriableError);
    expect((capturedError as retry.RetriableError).status).toBe(503);
    expect(result).toEqual(successBody);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry when Sonarr responds with non-retriable client errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response('missing', { status: 404, statusText: 'Not Found' }));

    const normalizedError = { code: ErrorCode.API_ERROR, message: 'missing', userMessage: 'missing', timestamp: Date.now() };
    const normalizeSpy = vi.spyOn(errorHandling, 'normalizeError').mockReturnValue(normalizedError);
    const logSpy = vi.spyOn(errorHandling, 'logError').mockImplementation(() => {});

    let capturedError: unknown;
    retrySpy.mockImplementation(async fn => {
      try {
        return await fn();
      } catch (error) {
        capturedError = error;
        throw error;
      }
    });

    await expect(service.getAllSeries(BASE_CREDENTIALS)).rejects.toBe(normalizedError);

    expect(capturedError).toBeInstanceOf(retry.RetriableError);
    expect((capturedError as retry.RetriableError).status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(normalizeSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(normalizedError, 'SonarrApiService:request:series');
  });
});
