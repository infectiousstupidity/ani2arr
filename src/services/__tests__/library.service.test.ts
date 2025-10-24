// src/services/__tests__/library.service.test.ts
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { LibraryService } from '@/services/library.service';
import type { LeanSonarrSeries, SonarrSeries, ExtensionOptions, CheckSeriesStatusResponse, CheckSeriesStatusPayload } from '@/types';
import type { CacheHit, TtlCache } from '@/cache';
import * as storageModule from '@/utils/storage';
import { ErrorCode, createError } from '@/utils/error-handling';
import * as errorHandling from '@/utils/error-handling';
import type { MappingService } from '@/services/mapping';
import type { SonarrApiService } from '@/api/sonarr.api';
import { canonicalizeLookupTerm } from '@/utils/matching';
import { getMetricsSnapshot, resetMetrics } from '@/utils/metrics';
import { createLeanSonarrSeriesFixture, createSonarrSeriesFixture } from '@/testing/fixtures/sonarr';

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
  sonarrApiKey: '0123456789abcdef0123456789abcdef',
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

const createLeanSeries = (overrides: Partial<LeanSonarrSeries> = {}) =>
  createLeanSonarrSeriesFixture({ ...overrides });

const createSonarrSeries = (overrides: Partial<SonarrSeries> = {}) =>
  createSonarrSeriesFixture({ ...overrides });

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
    resetMetrics();
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

  optionsSpy = vi.spyOn(storageModule, 'getExtensionOptionsSnapshot');
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
      setPrivate(service, 'normalizedTitleIndex', new Map([['foo', 123]]));
      setPrivate(service, 'leanSeriesByTvdbId', new Map([[123, createLeanSeries({ tvdbId: 123 })]]));

      const result = await service.refreshCache();

      expect(result).toEqual([]);
      expect(cache.write).toHaveBeenCalledWith('sonarr:lean-series', [], STANDARD_TTL);
      expect(getPrivate<Set<number>>(service, 'tvdbSet').size).toBe(0);
      expect(getPrivate<Map<string, number | null>>(service, 'normalizedTitleIndex').size).toBe(0);
      expect(getPrivate<Map<number, LeanSonarrSeries>>(service, 'leanSeriesByTvdbId').size).toBe(0);
    });

    it('uses provided options overrides without reading extension storage', async () => {
      cache.read.mockResolvedValueOnce(null);
      const override: ExtensionOptions = {
        ...BASE_OPTIONS,
        sonarrUrl: 'https://override.local',
        sonarrApiKey: 'fedcba9876543210fedcba9876543210',
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
        [{ tvdbId: 999, id: 22, titleSlug: 'override-slug', title: 'Kitsunarr Test Series' }],
        STANDARD_TTL,
      );
      expect(result).toEqual([
        { tvdbId: 999, id: 22, titleSlug: 'override-slug', title: 'Kitsunarr Test Series' },
      ]);
    });

    it('persists lean entries with standard TTLs when Sonarr returns data', async () => {
      cache.read.mockResolvedValueOnce(null);
      const fullList = [
        createSonarrSeries({ id: 10, tvdbId: 200, titleSlug: 'valid-one', title: 'Valid One' }),
        createSonarrSeries({ id: 11, tvdbId: Number.NaN, titleSlug: 'invalid-nan' }),
        createSonarrSeries({ id: 12, tvdbId: 'oops' as unknown as number, titleSlug: 'invalid-string' }),
        createSonarrSeries({ id: 13, tvdbId: 300, titleSlug: 'valid-two', title: 'Valid Two' }),
      ];
      sonarrClient.getAllSeries.mockResolvedValueOnce(fullList);

  const leanSeriesList = await service.refreshCache();

  expect(leanSeriesList).toEqual([
    { tvdbId: 200, id: 10, titleSlug: 'valid-one', title: 'Valid One' },
    { tvdbId: 300, id: 13, titleSlug: 'valid-two', title: 'Valid Two' },
  ]);
  expect(sonarrClient.getAllSeries).toHaveBeenCalledTimes(1);
      expect(cache.write).toHaveBeenCalledWith(
        'sonarr:lean-series',
        [
          { tvdbId: 200, id: 10, titleSlug: 'valid-one', title: 'Valid One' },
          { tvdbId: 300, id: 13, titleSlug: 'valid-two', title: 'Valid Two' },
        ],
        STANDARD_TTL,
      );
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
        createSonarrSeries({ id: 20, tvdbId: 800, titleSlug: 'fresh', title: 'Fresh Title' }),
      ]);
      await firstInflight!;

      expect(cache.write).toHaveBeenCalledWith(
        'sonarr:lean-series',
        [{ tvdbId: 800, id: 20, titleSlug: 'fresh', title: 'Fresh Title' }],
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
      setPrivate(service, 'normalizedTitleIndex', new Map([['foo', 111]]));

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
      expect(getPrivate<Map<string, number | null>>(service, 'normalizedTitleIndex').size).toBe(0);
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
      createSonarrSeries({ id: 20, tvdbId: 800, titleSlug: 'fresh', title: 'Fresh Title' }),
    ]);
    await inflightRefresh!;

    expect(cache.write).toHaveBeenCalledWith(
      'sonarr:lean-series',
      [{ tvdbId: 800, id: 20, titleSlug: 'fresh', title: 'Fresh Title' }],
      STANDARD_TTL,
    );
  });

  describe('normalized index', () => {
    it('hydrates canonical, alternate, and slug variants during refresh', async () => {
      cache.read.mockResolvedValueOnce(null);
      const list = [
        createSonarrSeries({
          id: 10,
          tvdbId: 1000,
          title: 'My Show (2023)',
          titleSlug: 'my-show',
          alternateTitles: [{ title: 'My Show Season 1' }, { title: 'The My Show' }, { title: null }],
        }),
        createSonarrSeries({
          id: 20,
          tvdbId: 2000,
          title: 'Other Show',
          titleSlug: 'other-show',
          alternateTitles: [{ title: 'Other-Show' }],
        }),
      ];
      sonarrClient.getAllSeries.mockResolvedValueOnce(list);

      await service.refreshCache();

      const index = getPrivate<Map<string, number | null>>(service, 'normalizedTitleIndex');
      const tvdbSet = getPrivate<Set<number>>(service, 'tvdbSet');

      expect(tvdbSet).toEqual(new Set([1000, 2000]));
      expect(index.get(canonicalizeLookupTerm('My Show (2023)'))).toBe(1000);
      expect(index.get(canonicalizeLookupTerm('My Show'))).toBe(1000);
      expect(index.get(canonicalizeLookupTerm('my-show'))).toBe(1000);
      expect(index.get(canonicalizeLookupTerm('my show'))).toBe(1000);
      expect(index.get(canonicalizeLookupTerm('My Show Season 1'))).toBe(1000);
      expect(index.get(canonicalizeLookupTerm('The My Show'))).toBe(1000);
      expect(index.get(canonicalizeLookupTerm('“My Show” / 2023'))).toBe(1000);
      expect(index.get(canonicalizeLookupTerm('Other Show'))).toBe(2000);
      expect(index.get(canonicalizeLookupTerm('Other-Show'))).toBe(2000);
    });

    it('resolves lookups locally by title and slug before hitting mapping', async () => {
      const lean = createLeanSeries({
        tvdbId: 321,
        id: 42,
        title: 'Local Hit',
        titleSlug: 'local-hit',
      });
      const hit = createCacheHit([lean]);
      cache.read.mockResolvedValue(hit);

      const byTitle = await service.getSeriesStatus({ anilistId: 1, title: 'Local Hit' });

      expect(mappingService.resolveTvdbId).not.toHaveBeenCalled();
      expect(byTitle).toEqual({ exists: true, tvdbId: 321, series: lean });

      const bySlug = await service.getSeriesStatus({ anilistId: 2, title: 'local-hit' });

      expect(mappingService.resolveTvdbId).not.toHaveBeenCalled();
      expect(bySlug).toEqual({ exists: true, tvdbId: 321, series: lean });
    });

    it('rebuilds the normalized index after cache mutations', async () => {
      const initial = createLeanSeries({
        tvdbId: 101,
        id: 5,
        title: 'Initial Title',
        titleSlug: 'initial-title',
      });
      const initialHit = createCacheHit([initial]);
      cache.read.mockResolvedValue(initialHit);

      await service.getLeanSeriesList();

      let index = getPrivate<Map<string, number | null>>(service, 'normalizedTitleIndex');
      expect(index.get(canonicalizeLookupTerm('Initial Title'))).toBe(101);

      await service.removeSeriesFromCache(101);

      index = getPrivate(service, 'normalizedTitleIndex');
      expect(index.size).toBe(0);
      expect(getPrivate<Set<number>>(service, 'tvdbSet').size).toBe(0);

      const emptyHit = createCacheHit([]);
      cache.read.mockResolvedValue(emptyHit);
      const newSeries = createSonarrSeries({
        id: 9,
        tvdbId: 909,
        title: 'New Show',
        titleSlug: 'new-show',
        alternateTitles: [{ title: 'New Show Alt' }],
      });

      await service.addSeriesToCache(newSeries);

      index = getPrivate(service, 'normalizedTitleIndex');
      expect(index.get(canonicalizeLookupTerm('New Show'))).toBe(909);
      expect(index.get(canonicalizeLookupTerm('New Show Alt'))).toBe(909);
    });
  });

  describe('local index heuristics', () => {
    const getFinder = () =>
      getPrivate<(payload: CheckSeriesStatusPayload) => number | null>(service, 'findTvdbIdInIndex');

    it('accepts high-confidence fuzzy matches and records a hit', () => {
      const tvdbId = 4321;
      const normalizedTitle = canonicalizeLookupTerm('Boku no Hero Academia 5th Season');
      const index = new Map<string, number | null>();
      if (normalizedTitle) {
        index.set(normalizedTitle, tvdbId);
      }
      const leanSeries = createLeanSeries({
        tvdbId,
        title: 'My Hero Academia Season 5',
        titleSlug: 'boku-no-hero-academia-5th-season',
      });

      setPrivate(service, 'normalizedTitleIndex', index);
      setPrivate(service, 'tvdbSet', new Set([tvdbId]));
      setPrivate(service, 'leanSeriesByTvdbId', new Map([[tvdbId, leanSeries]]));

      const find = getFinder();
      const result = find.call(service, {
        anilistId: 10,
        title: 'Boku no Hero Academia 5th Season',
        metadata: { startYear: 2021 },
      });

      expect(result).toBe(tvdbId);
      const snapshot = getMetricsSnapshot();
      expect(snapshot.counters['library.index.hit']).toBe(1);
      expect(snapshot.counters['library.index.miss']).toBeUndefined();
      expect(snapshot.counters['library.index.ambiguous']).toBeUndefined();
    });

    it('rejects low scoring matches and records a miss', () => {
      const tvdbId = 9876;
      const normalizedTitle = canonicalizeLookupTerm('Naruto');
      const index = new Map<string, number | null>();
      if (normalizedTitle) {
        index.set(normalizedTitle, tvdbId);
      }
      const leanSeries = createLeanSeries({
        tvdbId,
        title: 'Boruto: Naruto Next Generations',
        titleSlug: 'boruto-naruto-next-generations',
      });

      setPrivate(service, 'normalizedTitleIndex', index);
      setPrivate(service, 'tvdbSet', new Set([tvdbId]));
      setPrivate(service, 'leanSeriesByTvdbId', new Map([[tvdbId, leanSeries]]));

      const find = getFinder();
      const result = find.call(service, {
        anilistId: 11,
        title: 'Naruto',
        metadata: { startYear: 2002 },
      });

      expect(result).toBeNull();
      const snapshot = getMetricsSnapshot();
      expect(snapshot.counters['library.index.miss']).toBe(1);
      expect(snapshot.counters['library.index.hit']).toBeUndefined();
    });

    it('counts ambiguous matches when normalized candidates map to conflicting TVDB ids', () => {
      const normalizedTitle = canonicalizeLookupTerm('Conflicting Title');
      const index = new Map<string, number | null>();
      if (normalizedTitle) {
        index.set(normalizedTitle, null);
      }
      setPrivate(service, 'normalizedTitleIndex', index);
      setPrivate(service, 'tvdbSet', new Set([111, 222]));
      setPrivate(service, 'leanSeriesByTvdbId', new Map());

      const find = getFinder();
      const result = find.call(service, { anilistId: 3, title: 'Conflicting Title' });

      expect(result).toBeNull();
      const snapshot = getMetricsSnapshot();
      expect(snapshot.counters['library.index.ambiguous']).toBe(1);
      expect(snapshot.counters['library.index.hit']).toBeUndefined();
    });
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

    it('returns a missing-link response when mapping returns null (no match)', async () => {
      cache.read.mockResolvedValueOnce(createCacheHit([]));
      // resolveTvdbId now returns null when no mapping is found (instead of throwing VALIDATION_ERROR)
      mappingService.resolveTvdbId.mockResolvedValueOnce(null);

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
      const foundSeries = createSonarrSeries({
        id: 777,
        tvdbId: 555,
        titleSlug: 'from-sonarr',
        title: 'From Sonarr',
        alternateTitles: [{ title: 'Alt Sonarr' }],
      });
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
        [
          {
            tvdbId: 555,
            id: 777,
            titleSlug: 'from-sonarr',
            title: 'From Sonarr',
            alternateTitles: ['Alt Sonarr'],
          },
        ],
        STANDARD_TTL,
      );
      expect(response).toEqual({
        exists: true,
        tvdbId: 555,
        series: {
          tvdbId: 555,
          id: 777,
          titleSlug: 'from-sonarr',
          title: 'From Sonarr',
          alternateTitles: ['Alt Sonarr'],
        },
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
