// src/api/__tests__/sonarr.api.test.ts
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { SonarrApiService } from '@/api/sonarr.api';
import type { AddRequestPayload, ExtensionOptions, SonarrCredentialsPayload } from '@/types';
import { ErrorCode } from '@/utils/error-handling';
import * as validation from '@/utils/validation';
import * as errorHandling from '@/utils/error-handling';
import PRetry from 'p-retry';

const BASE_CREDENTIALS: SonarrCredentialsPayload = {
  url: 'https://sonarr.local',
  apiKey: 'abc123',
};

vi.mock('p-retry');

describe('SonarrApiService', () => {
  let service: SonarrApiService;
  let fetchMock: ReturnType<typeof vi.fn>;
  let hasPermissionSpy: ReturnType<typeof vi.spyOn>;
  let pRetryMock: ReturnType<typeof vi.mocked<typeof PRetry>>;

  beforeEach(() => {
    service = new SonarrApiService();
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    hasPermissionSpy = vi.spyOn(validation, 'hasSonarrPermission') as unknown as ReturnType<typeof vi.spyOn>;
    hasPermissionSpy.mockResolvedValue(true);

    pRetryMock = vi.mocked(PRetry);
    pRetryMock.mockImplementation(async (fn: (attemptNumber: number) => PromiseLike<unknown> | unknown) => fn(1));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('short-circuits when Sonarr credentials are missing', async () => {
    const attempt = service.getAllSeries({ url: '', apiKey: '' });

    await expect(attempt).rejects.toMatchObject({ code: ErrorCode.CONFIGURATION_ERROR });
    expect(pRetryMock).not.toHaveBeenCalled();
    expect(hasPermissionSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('short-circuits when Sonarr permission is denied', async () => {
    hasPermissionSpy.mockResolvedValueOnce(false);

    const attempt = service.getAllSeries(BASE_CREDENTIALS);

    await expect(attempt).rejects.toMatchObject({ code: ErrorCode.PERMISSION_ERROR });
    expect(pRetryMock).not.toHaveBeenCalled();
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
  const call = fetchMock.mock.calls[0]! as [string, RequestInit | undefined];
  const [url, requestInit] = call;
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

  it('treats explicit zero content-length responses as empty payloads', async () => {
    const request = (service as unknown as { request: SonarrApiService['request'] }).request.bind(service);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200, headers: { 'Content-Length': '0' } }));

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
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('500');
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
    pRetryMock.mockImplementation(async (fn: (attemptNumber: number) => PromiseLike<unknown> | unknown) => {
      try {
        return await fn(1);
      } catch (error) {
        capturedError = error;
        // Retry once on server error
        return await fn(2);
      }
    });

    const result = await service.getAllSeries(BASE_CREDENTIALS);

    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toContain('503');
    expect(result).toEqual(successBody);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry when Sonarr responds with non-retriable client errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response('missing', { status: 404, statusText: 'Not Found' }));

    const normalizedError = { code: ErrorCode.API_ERROR, message: 'missing', userMessage: 'missing', timestamp: Date.now() };
    const normalizeSpy = vi.spyOn(errorHandling, 'normalizeError').mockReturnValue(normalizedError);
    const logSpy = vi.spyOn(errorHandling, 'logError').mockImplementation(() => {});

    let capturedError: unknown;
    pRetryMock.mockImplementation(async (fn: (attemptNumber: number) => PromiseLike<unknown> | unknown) => {
      try {
        return await fn(1);
      } catch (error) {
        capturedError = error;
        throw error;
      }
    });

    await expect(service.getAllSeries(BASE_CREDENTIALS)).rejects.toBe(normalizedError);

    // AbortError is thrown for non-retriable client errors (400-499 except 429)
    expect(capturedError).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(normalizeSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(normalizedError, 'SonarrApiService:request:series');
  });

  it('includes retry-after seconds header values on rate limiting errors', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('slow down', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '7' },
      }),
    );

    let captured: (Error & { retryAfterMs?: number }) | null = null;
    const normalizedError = { code: ErrorCode.API_ERROR, message: '429', userMessage: '429', timestamp: Date.now() };
    const normalizeSpy = vi.spyOn(errorHandling, 'normalizeError').mockImplementation(error => {
      captured = error as Error & { retryAfterMs?: number };
      return normalizedError;
    });
    const logSpy = vi.spyOn(errorHandling, 'logError').mockImplementation(() => {});

    await expect(service.getAllSeries(BASE_CREDENTIALS)).rejects.toBe(normalizedError);

    expect(captured).toBeInstanceOf(Error);
    expect(captured).not.toBeNull();
    const capturedErr = captured as unknown as Error & { retryAfterMs?: number };
    expect(capturedErr.message).toContain('429');
    expect(capturedErr.retryAfterMs).toBe(7_000);

    normalizeSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('derives retry-after ms from HTTP date headers when rate limited', async () => {
    const retryDate = new Date(Date.now() + 10_000).toUTCString();
    fetchMock.mockResolvedValueOnce(
      new Response('slow down', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': retryDate },
      }),
    );

    let captured: (Error & { retryAfterMs?: number }) | null = null;
    const normalizedError = { code: ErrorCode.API_ERROR, message: '429', userMessage: '429', timestamp: Date.now() };
    const normalizeSpy = vi.spyOn(errorHandling, 'normalizeError').mockImplementation(error => {
      captured = error as Error & { retryAfterMs?: number };
      return normalizedError;
    });
    const logSpy = vi.spyOn(errorHandling, 'logError').mockImplementation(() => {});

    await expect(service.getAllSeries(BASE_CREDENTIALS)).rejects.toBe(normalizedError);

    expect(captured).toBeInstanceOf(Error);
    expect(captured).not.toBeNull();
    const capturedErr = captured as unknown as Error & { retryAfterMs?: number };
    expect(capturedErr.message).toContain('429');
    expect(capturedErr.retryAfterMs).toBeGreaterThanOrEqual(0);
    expect(capturedErr.retryAfterMs).toBeLessThanOrEqual(10_000);

    normalizeSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('treats content-length null with empty body as an empty payload', async () => {
    const request = (service as unknown as { request: SonarrApiService['request'] }).request.bind(service);
    const cloneText = vi.fn().mockResolvedValue('   ');
    const response = {
      ok: true,
      status: 200,
      headers: { get: () => null } as unknown as Headers,
      clone: () => ({ text: cloneText }),
      json: vi.fn(),
    };

    fetchMock.mockResolvedValueOnce(response as unknown as Response);

    const result = await request('series', BASE_CREDENTIALS);
    expect(result).toEqual({});
    expect(cloneText).toHaveBeenCalledTimes(1);
    expect(response.json).not.toHaveBeenCalled();
  });

  it('returns null when series lookup by tvdb id has no matches', async () => {
    fetchMock.mockResolvedValueOnce(new Response('[]', { status: 200 }));
    const result = await service.getSeriesByTvdbId(404, BASE_CREDENTIALS);
    expect(result).toBeNull();
  });

  it('returns Sonarr metadata lists and system status', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 10 }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 20 }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 30 }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: '4.0.0' }), { status: 200 }));

    const roots = await service.getRootFolders(BASE_CREDENTIALS);
    const profiles = await service.getQualityProfiles(BASE_CREDENTIALS);
    const tags = await service.getTags(BASE_CREDENTIALS);
    const status = await service.testConnection(BASE_CREDENTIALS);

    expect(roots).toEqual([{ id: 10 }]);
    expect(profiles).toEqual([{ id: 20 }]);
    expect(tags).toEqual([{ id: 30 }]);
    expect(status).toEqual({ version: '4.0.0' });
  });
});
