// src/services/__tests__/library.service.test.ts
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { LibraryService } from '@/services/library.service';
import type { LeanSonarrSeries, SonarrSeries, ExtensionOptions, CheckSeriesStatusResponse } from '@/types';
import type { CacheHit, TtlCache } from '@/cache';
import { extensionOptions } from '@/utils/storage';
import { ErrorCode, createError } from '@/utils/error-handling';
import * as errorHandling from '@/utils/error-handling';
import type { MappingService } from '@/services/mapping.service';
import type { SonarrApiService } from '@/api/sonarr.api';

type CacheMock = TtlCache<LeanSonarrSeries[]> & {
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
};

type MappingMock = Pick<MappingService, 'resolveTvdbId'> & {
  resolveTvdbId: ReturnType<typeof vi.fn>;
};

type SonarrClientMock = Pick<SonarrApiService, 'getAllSeries' | 'getSeriesByTvdbId'> & {
  getAllSeries: ReturnType<typeof vi.fn>;
  getSeriesByTvdbId: ReturnType<typeof vi.fn>;
};

const STANDARD_TTL = { staleMs: 60 * 60 * 1000, hardMs: 24 * 60 * 60 * 1000 } as const;
const ERROR_TTL = { staleMs: 5 * 60 * 1000, hardMs: 10 * 60 * 1000 } as const;

const BASE_OPTIONS: ExtensionOptions = {
  sonarrUrl: 'https://sonarr.local',
  sonarrApiKey: 'apikey-123',
  defaults: {
    qualityProfileId: 1,
    rootFolderPath: '/anime',
    seriesType: 'anime',
    monitorOption: 'all',
    seasonFolder: true,
    searchForMissingEpisodes: false,
    tags: [],
  },
};

const createCacheMock = (): CacheMock => {
  const cache: CacheMock = {
    read: vi.fn(),
    write: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  } as unknown as CacheMock;

  return cache;
};

const createLeanSeries = (overrides: Partial<LeanSonarrSeries> = {}): LeanSonarrSeries => ({
  tvdbId: 100,
  id: 1,
  titleSlug: 'lean-slug',
  ...overrides,
});

const createSonarrSeries = (overrides: Partial<SonarrSeries> = {}): SonarrSeries => ({
  id: 1,
  title: 'Series Title',
  tvdbId: 100,
  titleSlug: 'series-title',
  ...overrides,
});

const createCacheHit = (
  value: LeanSonarrSeries[],
  overrides: Partial<CacheHit<LeanSonarrSeries[]>> = {},
): CacheHit<LeanSonarrSeries[]> => ({
  value,
  stale: false,
  staleAt: Date.now() + 1,
  expiresAt: Date.now() + 2,
  ...overrides,
});

const getPrivate = <T>(instance: object, key: string): T =>
  Reflect.get(instance as Record<string, unknown>, key) as T;

const setPrivate = (instance: object, key: string, value: unknown): void => {
  Reflect.set(instance as Record<string, unknown>, key, value);
};

describe('LibraryService', () => {
  let cache: CacheMock;
  let sonarrClient: SonarrClientMock;
  let mappingService: MappingMock;
  let mutationSpy: ReturnType<typeof vi.fn>;
  let service: LibraryService;
  let optionsSpy: MockInstance;
  let logErrorSpy: MockInstance;

  beforeEach(() => {
    cache = createCacheMock();
    sonarrClient = {
      getAllSeries: vi.fn(),
      getSeriesByTvdbId: vi.fn(),
    } as unknown as SonarrClientMock;
    mappingService = {
      resolveTvdbId: vi.fn(),
    } as unknown as MappingMock;
    mutationSpy = vi.fn();
    service = new LibraryService(
      sonarrClient as unknown as SonarrApiService,
      mappingService as unknown as MappingService,
      cache,
      mutationSpy,
    );

    optionsSpy = vi.spyOn(extensionOptions, 'getValue');
    optionsSpy.mockResolvedValue(BASE_OPTIONS);

    logErrorSpy = vi.spyOn(errorHandling, 'logError').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('refreshCache', () => {
    it('clears the cache and resets the TVDB index when Sonarr is unconfigured', async () => {
      const fallback = [createLeanSeries({ tvdbId: 5, id: 5 })];
      cache.read.mockResolvedValueOnce(createCacheHit(fallback));
      const unconfigured = { ...BASE_OPTIONS, sonarrUrl: '', sonarrApiKey: '' } as const;
      optionsSpy.mockResolvedValueOnce(unconfigured);
      optionsSpy.mockResolvedValueOnce(unconfigured);

      setPrivate(service, 'tvdbSet', new Set([123]));

      const result = await service.refreshCache();

      expect(result).toEqual([]);
      expect(cache.write).toHaveBeenCalledWith('sonarr:lean-series', [], STANDARD_TTL);
      expect(getPrivate<Set<number>>(service, 'tvdbSet').size).toBe(0);
    });

    it('uses provided options overrides without reading extension storage', async () => {
      cache.read.mockResolvedValueOnce(null);
      const override: ExtensionOptions = {
        ...BASE_OPTIONS,
        sonarrUrl: 'https://override.local',
        sonarrApiKey: 'override-key',
      };
      const fullList = [
        createSonarrSeries({ id: 22, tvdbId: 999, titleSlug: 'override-slug' }),
      ];
      sonarrClient.getAllSeries.mockResolvedValueOnce(fullList);
      optionsSpy.mockClear();

      const result = await service.refreshCache(override);

      expect(optionsSpy).not.toHaveBeenCalled();
      expect(sonarrClient.getAllSeries).toHaveBeenCalledWith({
        url: override.sonarrUrl,
        apiKey: override.sonarrApiKey,
      });
      expect(cache.write).toHaveBeenCalledWith(
        'sonarr:lean-series',
        [{ tvdbId: 999, id: 22, titleSlug: 'override-slug' }],
        STANDARD_TTL,
      );
      expect(result).toEqual([{ tvdbId: 999, id: 22, titleSlug: 'override-slug' }]);
    });

    it('persists lean entries with standard TTLs when Sonarr returns data', async () => {
      cache.read.mockResolvedValueOnce(null);
      const fullList = [
        createSonarrSeries({ id: 10, tvdbId: 200, titleSlug: 'valid-one' }),
        createSonarrSeries({ id: 11, tvdbId: Number.NaN, titleSlug: 'invalid-nan' }),
        createSonarrSeries({ id: 12, tvdbId: 'oops' as unknown as number, titleSlug: 'invalid-string' }),
        createSonarrSeries({ id: 13, tvdbId: 300, titleSlug: 'valid-two' }),
      ];
      sonarrClient.getAllSeries.mockResolvedValueOnce(fullList);

      const result = await service.refreshCache();

      expect(sonarrClient.getAllSeries).toHaveBeenCalledTimes(1);
      expect(cache.write).toHaveBeenCalledWith(
        'sonarr:lean-series',
        [
          { tvdbId: 200, id: 10, titleSlug: 'valid-one' },
          { tvdbId: 300, id: 13, titleSlug: 'valid-two' },
        ],
        STANDARD_TTL,
      );
      expect(result).toEqual([
        { tvdbId: 200, id: 10, titleSlug: 'valid-one' },
        { tvdbId: 300, id: 13, titleSlug: 'valid-two' },
      ]);
      expect(getPrivate<Set<number>>(service, 'tvdbSet')).toEqual(new Set([200, 300]));
    });

    it('logs errors and writes fallback data with error TTLs when Sonarr fetch fails', async () => {
      const fallback = [createLeanSeries({ tvdbId: 9, id: 9, titleSlug: 'fallback' })];
      cache.read.mockResolvedValueOnce(createCacheHit(fallback));
      const failure = createError(ErrorCode.NETWORK_ERROR, 'boom', 'Network boom');
      sonarrClient.getAllSeries.mockRejectedValueOnce(failure);

      const result = await service.refreshCache();

      expect(result).toEqual(fallback);
      expect(cache.write).toHaveBeenCalledWith(
        'sonarr:lean-series',
        fallback,
        expect.objectContaining({
          staleMs: ERROR_TTL.staleMs,
          hardMs: ERROR_TTL.hardMs,
          meta: { lastErrorCode: ErrorCode.NETWORK_ERROR },
        }),
      );
      expect(logErrorSpy).toHaveBeenCalledWith(failure, 'LibraryService:refreshCache');
      expect(getPrivate<Set<number>>(service, 'tvdbSet')).toEqual(new Set([9]));
    });
  });

  describe('getLeanSeriesList', () => {
    it('returns stale cache entries while kicking off a single background refresh', async () => {
      const cached = [createLeanSeries({ tvdbId: 7, id: 7, titleSlug: 'stale' })];
      const cacheHit = createCacheHit(cached, { stale: true });
      cache.read.mockResolvedValueOnce(cacheHit);
      cache.read.mockResolvedValueOnce(cacheHit);
      cache.read.mockResolvedValueOnce(cacheHit);

      const deferred: {
        promise: Promise<SonarrSeries[]>;
        resolve: (value: SonarrSeries[]) => void;
        reject: (reason?: unknown) => void;
      } = (() => {
        let resolve: (value: SonarrSeries[]) => void = () => {};
        let reject: (reason?: unknown) => void = () => {};
        const promise = new Promise<SonarrSeries[]>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        return { promise, resolve, reject };
      })();

      sonarrClient.getAllSeries.mockReturnValueOnce(deferred.promise);

      const firstResult = await service.getLeanSeriesList();
      expect(firstResult).toEqual(cached);

      const firstInflight = getPrivate<Promise<LeanSonarrSeries[]> | null>(service, 'inflightRefresh');
      expect(firstInflight).toBeInstanceOf(Promise);

      const secondResult = await service.getLeanSeriesList();
      expect(secondResult).toEqual(cached);
      const secondInflight = getPrivate<Promise<LeanSonarrSeries[]> | null>(service, 'inflightRefresh');
      expect(secondInflight).toBe(firstInflight);
      expect(sonarrClient.getAllSeries).toHaveBeenCalledTimes(1);

      deferred.resolve([
        createSonarrSeries({ id: 20, tvdbId: 800, titleSlug: 'fresh' }),
      ]);
      await firstInflight!;

      expect(cache.write).toHaveBeenCalledWith(
        'sonarr:lean-series',
        [{ tvdbId: 800, id: 20, titleSlug: 'fresh' }],
        STANDARD_TTL,
      );
    });

    it('resets the tvdb index when a stale refresh finds Sonarr unconfigured', async () => {
      const cached = [createLeanSeries({ tvdbId: 9, id: 9, titleSlug: 'stale' })];
      const cacheHit = createCacheHit(cached, { stale: true });
      cache.read.mockResolvedValueOnce(cacheHit);
      cache.read.mockResolvedValueOnce(cacheHit);

      const unconfigured = { ...BASE_OPTIONS, sonarrUrl: '', sonarrApiKey: '' } as const;
      optionsSpy.mockResolvedValue(unconfigured);

      setPrivate(service, 'tvdbSet', new Set([111]));

      const list = await service.getLeanSeriesList();
      expect(list).toEqual(cached);

      const inflight = getPrivate<Promise<LeanSonarrSeries[]> | null>(service, 'inflightRefresh');
      if (inflight) {
        await inflight;
      } else {
        await Promise.resolve();
      }

      expect(sonarrClient.getAllSeries).not.toHaveBeenCalled();
      expect(cache.write).toHaveBeenCalledWith('sonarr:lean-series', [], STANDARD_TTL);
      expect(getPrivate<Set<number>>(service, 'tvdbSet').size).toBe(0);
    });
  });

  it('returns cached data immediately when stale and triggers a background refresh', async () => {
    const cached = [createLeanSeries({ tvdbId: 7, id: 7, titleSlug: 'stale' })];
    const cacheHit = createCacheHit(cached, { stale: true });
    cache.read.mockResolvedValueOnce(cacheHit);
    cache.read.mockResolvedValueOnce(cacheHit);

    const deferred: {
      promise: Promise<SonarrSeries[]>;
      resolve: (value: SonarrSeries[]) => void;
      reject: (reason?: unknown) => void;
    } = (() => {
      let resolve: (value: SonarrSeries[]) => void = () => {};
      let reject: (reason?: unknown) => void = () => {};
      const promise = new Promise<SonarrSeries[]>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    })();

    sonarrClient.getAllSeries.mockReturnValueOnce(deferred.promise);

    const list = await service.getLeanSeriesList();

    expect(list).toEqual(cached);
    const inflightRefresh = getPrivate<Promise<LeanSonarrSeries[]> | null>(service, 'inflightRefresh');
    expect(inflightRefresh).toBeInstanceOf(Promise);
    expect(inflightRefresh).not.toBeNull();
    expect(cache.write).not.toHaveBeenCalled();

    deferred.resolve([
      createSonarrSeries({ id: 20, tvdbId: 800, titleSlug: 'fresh' }),
    ]);
    await inflightRefresh!;

    expect(cache.write).toHaveBeenCalledWith(
      'sonarr:lean-series',
      [{ tvdbId: 800, id: 20, titleSlug: 'fresh' }],
      STANDARD_TTL,
    );
  });

  describe('cache mutations', () => {
    it('ignores duplicate series when adding to the cache', async () => {
      const existing = createLeanSeries({ id: 55, tvdbId: 550, titleSlug: 'existing' });
      cache.read.mockResolvedValueOnce(createCacheHit([existing]));

      await service.addSeriesToCache(
        createSonarrSeries({ id: 55, tvdbId: 550, titleSlug: 'existing' }),
      );

      expect(cache.write).not.toHaveBeenCalled();
    });

    it('rewrites the cache after removing an existing series', async () => {
      const existing = createLeanSeries({ id: 60, tvdbId: 600, titleSlug: 'remove-me' });
      cache.read.mockResolvedValueOnce(createCacheHit([existing]));
      cache.read.mockResolvedValueOnce(createCacheHit([existing]));

      await service.removeSeriesFromCache(600);

      expect(cache.write).toHaveBeenCalledWith('sonarr:lean-series', [], STANDARD_TTL);
    });
  });

  describe('getSeriesStatus', () => {
    const mappingResult = { tvdbId: 321, successfulSynonym: 'Alt Title' } as const;

    it('returns a missing-link response when mapping throws configuration or validation errors', async () => {
      const unconfigured = { ...BASE_OPTIONS, sonarrUrl: '', sonarrApiKey: '' } as const;
      optionsSpy.mockResolvedValueOnce(unconfigured);
      optionsSpy.mockResolvedValueOnce(unconfigured);
      const configurationError = createError(
        ErrorCode.CONFIGURATION_ERROR,
        'config missing',
        'Configure Sonarr',
      );
      mappingService.resolveTvdbId.mockRejectedValueOnce(configurationError);

      const response = await service.getSeriesStatus(
        { anilistId: 42, title: 'Title' },
        { ignoreFailureCache: true },
      );

      expect(response).toEqual({ exists: false, tvdbId: null, anilistTvdbLinkMissing: true });
      expect(mappingService.resolveTvdbId).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          network: 'never',
          ignoreFailureCache: true,
          hints: { primaryTitle: 'Title' },
        }),
      );
    });

    it('returns a missing-link response when mapping throws validation errors', async () => {
      cache.read.mockResolvedValueOnce(createCacheHit([]));
      const validationError = createError(
        ErrorCode.VALIDATION_ERROR,
        'validation failed',
        'Validation error',
      );
      mappingService.resolveTvdbId.mockRejectedValueOnce(validationError);

      const response = await service.getSeriesStatus({ anilistId: 12, title: 'Title' });

      expect(response).toEqual({ exists: false, tvdbId: null, anilistTvdbLinkMissing: true });
    });

    it('returns cached series without hitting Sonarr when mapping resolves to an existing entry', async () => {
      const cached = createLeanSeries({ tvdbId: mappingResult.tvdbId, id: 999, titleSlug: 'cached' });
      cache.read.mockResolvedValueOnce(createCacheHit([cached]));
      mappingService.resolveTvdbId.mockResolvedValueOnce(mappingResult);

      const response = (await service.getSeriesStatus({ anilistId: 100, title: '  Cached Title  ' })) as CheckSeriesStatusResponse;

      expect(response).toEqual({
        exists: true,
        tvdbId: mappingResult.tvdbId,
        series: cached,
        successfulSynonym: mappingResult.successfulSynonym,
      });
      expect(mappingService.resolveTvdbId).toHaveBeenCalledWith(
        100,
        expect.objectContaining({ hints: { primaryTitle: 'Cached Title' } }),
      );
      expect(sonarrClient.getSeriesByTvdbId).not.toHaveBeenCalled();
      expect(mutationSpy).not.toHaveBeenCalled();
    });

    it('verifies against Sonarr when forced and adds lean entries when found', async () => {
      cache.read.mockResolvedValueOnce(createCacheHit([]));
      cache.read.mockResolvedValueOnce(createCacheHit([]));
      mappingService.resolveTvdbId.mockResolvedValueOnce({ tvdbId: 555 });
      const foundSeries = createSonarrSeries({ id: 777, tvdbId: 555, titleSlug: 'from-sonarr' });
      sonarrClient.getSeriesByTvdbId.mockResolvedValueOnce(foundSeries);

      const response = await service.getSeriesStatus(
        { anilistId: 77, title: 'Force Verify' },
        { force_verify: true },
      );

      expect(sonarrClient.getSeriesByTvdbId).toHaveBeenCalledWith(555, {
        url: BASE_OPTIONS.sonarrUrl,
        apiKey: BASE_OPTIONS.sonarrApiKey,
      });
      expect(cache.write).toHaveBeenCalledWith(
        'sonarr:lean-series',
        [{ tvdbId: 555, id: 777, titleSlug: 'from-sonarr' }],
        STANDARD_TTL,
      );
      expect(response).toEqual({
        exists: true,
        tvdbId: 555,
        series: { tvdbId: 555, id: 777, titleSlug: 'from-sonarr' },
        successfulSynonym: undefined,
      });
      expect(mutationSpy).toHaveBeenCalledTimes(1);
      expect(mutationSpy).toHaveBeenCalledWith({ tvdbId: 555, action: 'added' });
    });

    it('removes entries from the cache when forced verification finds no Sonarr match', async () => {
      const cached = createLeanSeries({ tvdbId: 888, id: 888, titleSlug: 'to-remove' });
      cache.read.mockResolvedValueOnce(createCacheHit([cached]));
      cache.read.mockResolvedValueOnce(createCacheHit([cached]));
      mappingService.resolveTvdbId.mockResolvedValueOnce({ tvdbId: 888 });
      sonarrClient.getSeriesByTvdbId.mockResolvedValueOnce(null);

      const response = await service.getSeriesStatus(
        { anilistId: 88, title: 'Needs Removal' },
        { force_verify: true },
      );

      expect(cache.write).toHaveBeenCalledWith('sonarr:lean-series', [], STANDARD_TTL);
      expect(response).toEqual({ exists: false, tvdbId: 888 });
      expect(mutationSpy).toHaveBeenCalledTimes(1);
      expect(mutationSpy).toHaveBeenCalledWith({ tvdbId: 888, action: 'removed' });
    });

    it('forwards ignoreFailureCache when force verifying Sonarr data', async () => {
      cache.read.mockResolvedValueOnce(createCacheHit([]));
      mappingService.resolveTvdbId.mockResolvedValueOnce({ tvdbId: 444 });
      sonarrClient.getSeriesByTvdbId.mockResolvedValueOnce(null);

      const response = await service.getSeriesStatus(
        { anilistId: 44, title: 'Ignore Failures' },
        { force_verify: true, ignoreFailureCache: true },
      );

      expect(mappingService.resolveTvdbId).toHaveBeenCalledWith(
        44,
        expect.objectContaining({ ignoreFailureCache: true }),
      );
      expect(sonarrClient.getSeriesByTvdbId).toHaveBeenCalledWith(444, {
        url: BASE_OPTIONS.sonarrUrl,
        apiKey: BASE_OPTIONS.sonarrApiKey,
      });
      expect(response).toEqual({ exists: false, tvdbId: 444 });
      expect(mutationSpy).not.toHaveBeenCalled();
    });
  });
});
