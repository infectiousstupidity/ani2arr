// src/services/__tests__/mapping.service.test.ts
const noop = () => {};
process.on('unhandledRejection', noop);

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CacheHit, CacheWriteOptions, TtlCache } from '@/cache';
import type { AnilistApiService, AniMedia } from '@/api/anilist.api';
import type { StaticMappingProvider } from '@/services/mapping/static-mapping.provider';
import { MappingService, type ResolvedMapping } from '@/services/mapping.service';
import type { SonarrLookupClient } from '@/services/mapping/sonarr-lookup.client';
import type { ExtensionOptions, SonarrLookupSeries } from '@/types';
import { createError, ErrorCode } from '@/utils/error-handling';
import { extensionOptions } from '@/utils/storage';
import { resetMetrics } from '@/utils/metrics';

type CacheStub<T> = TtlCache<T> & {
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
};

function createCacheStub<T>(): CacheStub<T> {
  const read = vi.fn(async (_key: string) => null as CacheHit<T> | null);
  const write = vi.fn(async (_key: string, _value: T, _options: CacheWriteOptions) => {});
  const remove = vi.fn(async (_key: string) => {});
  const clear = vi.fn(async () => {});
  return { read, write, remove, clear } as unknown as CacheStub<T>;
}

const baseOptions: ExtensionOptions = {
  sonarrUrl: 'http://localhost:8989',
  sonarrApiKey: 'abc123',
  defaults: {
    qualityProfileId: 1,
    rootFolderPath: '/anime',
    seriesType: 'anime',
    monitorOption: 'all',
    seasonFolder: true,
    searchForMissingEpisodes: true,
    tags: [],
  },
};

const defaultSeries = (overrides: Partial<SonarrLookupSeries> = {}): SonarrLookupSeries => ({
  tvdbId: 100,
  title: 'Example Series',
  year: 2020,
  genres: ['Action'],
  ...overrides,
});

describe('MappingService', () => {
  let successCache: CacheStub<ResolvedMapping>;
  let failureCache: CacheStub<ReturnType<typeof createError>>;
  let staticProvider: Pick<StaticMappingProvider, 'init' | 'get'>;
  let lookupClientMock: {
    reset: ReturnType<typeof vi.fn>;
    lookup: ReturnType<typeof vi.fn>;
    readFromCache: ReturnType<typeof vi.fn>;
  };
  let lookupClient: SonarrLookupClient;
  let anilistApi: Pick<AnilistApiService, 'fetchMediaWithRelations' | 'iteratePrequelChain'>;

  beforeEach(() => {
    resetMetrics();
    successCache = createCacheStub<ResolvedMapping>();
    failureCache = createCacheStub<ReturnType<typeof createError>>();

    staticProvider = {
      init: vi.fn(async () => {}),
      get: vi.fn(() => null),
    };

    lookupClientMock = {
      reset: vi.fn(async () => {}),
      lookup: vi.fn(async () => [] as SonarrLookupSeries[]),
      readFromCache: vi.fn(async () => [] as SonarrLookupSeries[]),
    };
    lookupClient = lookupClientMock as unknown as SonarrLookupClient;

    anilistApi = {
      fetchMediaWithRelations: vi.fn(async (id: number) =>
        ({
          id,
          format: 'TV',
          title: { romaji: 'Example Series' },
          startDate: { year: 2020 },
          synonyms: ['Sample Series'],
        }) as AniMedia,
      ),
      iteratePrequelChain: vi.fn(async function* () {
        yield* [] as AniMedia[];
      }),
    };

    vi.spyOn(extensionOptions, 'getValue').mockResolvedValue(baseOptions);
  });

  const createService = () =>
    new MappingService(
      anilistApi as unknown as AnilistApiService,
      staticProvider as StaticMappingProvider,
      lookupClient,
      {
        success: successCache,
        failure: failureCache,
      },
    );

  it('returns cached success when present', async () => {
    successCache.read.mockResolvedValue({
      value: { tvdbId: 111 },
      stale: false,
      staleAt: Date.now() + 1000,
      expiresAt: Date.now() + 2000,
    });

    const service = createService();
    const result = await service.resolveTvdbId(1);
    expect(result).toEqual({ tvdbId: 111 });
    expect(staticProvider.get).not.toHaveBeenCalled();
  });

  it('resolves from static provider and caches success', async () => {
    (staticProvider.get as ReturnType<typeof vi.fn>).mockReturnValue({ tvdbId: 222, source: 'primary' });

    const service = createService();
    const result = await service.resolveTvdbId(5);

    expect(result).toEqual({ tvdbId: 222 });
    expect(successCache.write).toHaveBeenCalledWith(expect.stringContaining('resolved:5'), { tvdbId: 222 }, expect.any(Object));
    expect(lookupClientMock.lookup).not.toHaveBeenCalled();
  });

  it('throws when network is disabled and no static mapping', async () => {
    const service = createService();
    await expect(service.resolveTvdbId(9, { network: 'never' })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
    expect(lookupClient.lookup).not.toHaveBeenCalled();
  });

  it('uses hint lookup before fetching AniList', async () => {
    lookupClientMock.lookup.mockResolvedValue([defaultSeries({ title: 'Hinted Title' })]);

    const service = createService();
    const result = await service.resolveTvdbId(10, { hints: { primaryTitle: 'Hinted Title' } });

    expect(result).toEqual({ tvdbId: 100, successfulSynonym: 'Hinted Title' });
    expect(anilistApi.fetchMediaWithRelations).not.toHaveBeenCalled();
    expect(lookupClientMock.lookup).toHaveBeenCalledWith(
      'hinted title',
      'Hinted Title',
      { url: baseOptions.sonarrUrl, apiKey: baseOptions.sonarrApiKey },
    );
  });

  it('performs AniList lookup and resolves best match', async () => {
    lookupClientMock.lookup.mockResolvedValue([defaultSeries()]);

    const service = createService();
    const result = await service.resolveTvdbId(11);

    expect(anilistApi.fetchMediaWithRelations).toHaveBeenCalledWith(11);
    expect(result).toEqual({ tvdbId: 100, successfulSynonym: 'Example Series' });
  });

  it('caches failure when lookup throws network error', async () => {
    const networkError = createError(ErrorCode.NETWORK_ERROR, 'network down', 'try later');
    lookupClientMock.lookup.mockRejectedValue(networkError);

    const service = createService();
    await expect(service.resolveTvdbId(12)).rejects.toBe(networkError);

    expect(failureCache.write).toHaveBeenCalledWith(
      expect.stringContaining('resolved-failure:12'),
      networkError,
      expect.objectContaining({ staleMs: expect.any(Number), hardMs: expect.any(Number) }),
    );
  });

  it('reuses failure cache when available', async () => {
    const storedError = createError(ErrorCode.VALIDATION_ERROR, 'cached', 'fail');
    failureCache.read.mockResolvedValue({
      value: storedError,
      stale: false,
      staleAt: Date.now() + 1_000,
      expiresAt: Date.now() + 2_000,
    });

    const service = createService();
    await expect(service.resolveTvdbId(13)).rejects.toBe(storedError);
    expect(lookupClientMock.lookup).not.toHaveBeenCalled();
  });

  it('bypasses failure cache when ignoreFailureCache option is true', async () => {
    const storedError = createError(ErrorCode.VALIDATION_ERROR, 'cached', 'fail');
    failureCache.read.mockResolvedValue({
      value: storedError,
      stale: false,
      staleAt: Date.now() + 1_000,
      expiresAt: Date.now() + 2_000,
    });
    lookupClientMock.lookup.mockResolvedValue([defaultSeries()]);

    const service = createService();
    const result = await service.resolveTvdbId(14, { ignoreFailureCache: true });

    expect(result.tvdbId).toBe(100);
    expect(lookupClientMock.lookup).toHaveBeenCalled();
  });

  it('resolves using prequel static mapping via iterator', async () => {
    (staticProvider.get as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ tvdbId: 444, source: 'primary' });

    (anilistApi.iteratePrequelChain as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
      yield { id: 20, format: 'TV', title: {}, synonyms: [] } as AniMedia;
      yield { id: 21, format: 'TV', title: {}, synonyms: [] } as AniMedia;
    });

    const service = createService();
    const result = await service.resolveTvdbId(15);

    expect(result).toEqual({ tvdbId: 444 });
    expect(lookupClientMock.lookup).not.toHaveBeenCalled();
  });

  it('resets lookup state by clearing caches', async () => {
    const service = createService();

    await service.resetLookupState();

    expect(lookupClientMock.reset).toHaveBeenCalled();
    expect(failureCache.clear).toHaveBeenCalled();
  });
});
