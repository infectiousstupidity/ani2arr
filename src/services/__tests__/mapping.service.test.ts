// src/services/__tests__/mapping.service.test.ts
const noop = () => {};
process.on('unhandledRejection', noop);

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CacheHit, CacheWriteOptions, TtlCache } from '@/cache';
import type { AnilistApiService } from '@/api/anilist.api';
import type { StaticMappingProvider } from '@/services/mapping/static-mapping.provider';
import { MappingService, type ResolvedMapping } from '@/services/mapping';
import type { SonarrLookupClient } from '@/services/mapping/sonarr-lookup.client';
import * as pipelineModule from '@/services/mapping/pipeline';
import type { ExtensionOptions, SonarrLookupSeries, AniMedia } from '@/types';
import { createError, ErrorCode } from '@/utils/error-handling';
import * as errorHandlingModule from '@/utils/error-handling';
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
  let anilistApi: Pick<AnilistApiService, 'fetchMediaWithRelations' | 'iteratePrequelChain'> & {
    removeMediaFromCache?: (id: number) => Promise<void>;
  };

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
      removeMediaFromCache: vi.fn(async () => {}),
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

  expect(result).not.toBeNull();
  expect(result!.tvdbId).toBe(100);
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

  it('evicts AniList cached media after static resolution and swallows eviction errors', async () => {
    const removeSpy = anilistApi.removeMediaFromCache as ReturnType<typeof vi.fn>;
    (staticProvider.get as ReturnType<typeof vi.fn>).mockImplementation((id: number) => ({ tvdbId: id + 100, source: 'static' }));
    removeSpy.mockResolvedValueOnce(undefined);
    removeSpy.mockRejectedValueOnce(new Error('evict failed'));

    const service = createService();

    await expect(service.resolveTvdbId(20)).resolves.toEqual({ tvdbId: 120 });
    await expect(service.resolveTvdbId(21)).resolves.toEqual({ tvdbId: 121 });

    expect(removeSpy).toHaveBeenNthCalledWith(1, 20);
    expect(removeSpy).toHaveBeenNthCalledWith(2, 21);
  });

  it('uses DOM metadata hints before fetching AniList data', async () => {
    const pipelineSpy = vi
      .spyOn(pipelineModule, 'resolveViaPipeline')
      .mockResolvedValue({
        status: 'resolved',
        tvdbId: 654,
        confidence: 0.92,
        successfulSynonym: 'Hint Title',
      } as never);

    const service = createService();
    const result = await service.resolveTvdbId(50, {
      hints: {
        domMedia: {
          titles: { english: 'Hint Title', romaji: 'Hint Title' },
          synonyms: ['Hint Title', 'Hint Title', ''],
          startYear: 2024,
          format: 'TV',
          relationPrequelIds: [200, 200],
        },
      },
    });

    expect(result).toEqual({ tvdbId: 654, successfulSynonym: 'Hint Title' });
    expect(anilistApi.fetchMediaWithRelations).not.toHaveBeenCalled();
    expect(pipelineSpy).toHaveBeenCalledTimes(1);

    const mediaArg = pipelineSpy.mock.calls[0]?.[0] as AniMedia;
    expect(mediaArg.startDate?.year).toBe(2024);
    expect(mediaArg.synonyms).toEqual(['Hint Title']);
    expect(mediaArg.relations?.edges?.[0]?.node.id).toBe(200);

    pipelineSpy.mockRestore();
  });

  it('falls back to AniList API when metadata hints are empty', async () => {
    const pipelineSpy = vi
      .spyOn(pipelineModule, 'resolveViaPipeline')
      .mockResolvedValue({
        status: 'resolved',
        tvdbId: 777,
        confidence: 0.8,
      } as never);

    const service = createService();
    const result = await service.resolveTvdbId(60, {
      hints: {
        domMedia: {
          titles: null,
          synonyms: null,
          startYear: null,
          format: null,
          relationPrequelIds: null,
        },
      },
    });

    expect(result).toEqual({ tvdbId: 777 });
    expect(anilistApi.fetchMediaWithRelations).toHaveBeenCalledWith(60);
    pipelineSpy.mockRestore();
  });

  it('returns null and caches validation failures when pipeline throws', async () => {
    const validationError = createError(ErrorCode.VALIDATION_ERROR, 'no match', 'No mapping');
    lookupClientMock.lookup.mockRejectedValueOnce(validationError);

    const service = createService();
    await expect(service.resolveTvdbId(42)).resolves.toBeNull();

    expect(failureCache.write).toHaveBeenCalledWith(
      expect.stringContaining('resolved-failure:42'),
      validationError,
      expect.objectContaining({ staleMs: expect.any(Number), hardMs: expect.any(Number) }),
    );
  });

  it('does not cache configuration errors when Sonarr credentials are missing', async () => {
    // Simulate unconfigured credentials by returning empty values
    vi.spyOn(extensionOptions, 'getValue').mockResolvedValueOnce({
      ...baseOptions,
      sonarrUrl: '',
      sonarrApiKey: '',
    });

    const service = createService();
    await expect(service.resolveTvdbId(88)).rejects.toMatchObject({ code: ErrorCode.SONARR_NOT_CONFIGURED });
    expect(failureCache.write).not.toHaveBeenCalled();
  });

  it('logs hint lookup errors and continues resolving', async () => {
    const service = createService();
    const hintSpy = vi.spyOn(
      service as unknown as { tryHintLookup: (term: string) => Promise<ResolvedMapping | null> },
      'tryHintLookup',
    );
    hintSpy.mockRejectedValueOnce(new Error('hint failed'));

    lookupClientMock.lookup.mockResolvedValueOnce([defaultSeries({ title: 'Hint Title' })]);

    const logSpy = vi.spyOn(errorHandlingModule, 'logError').mockImplementation(() => {});

    const result = await service.resolveTvdbId(70, { hints: { primaryTitle: 'Hint Title' } });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ code: ErrorCode.UNKNOWN_ERROR }),
      'MappingService:hintLookup:70',
    );
    expect(result).toEqual({ tvdbId: 100, successfulSynonym: 'Hint Title' });

    logSpy.mockRestore();
    hintSpy.mockRestore();
  });

  it('skips unsupported media formats without invoking the pipeline', async () => {
    const pipelineSpy = vi.spyOn(pipelineModule, 'resolveViaPipeline');
    (anilistApi.fetchMediaWithRelations as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 90,
      format: 'MANGA',
      title: { romaji: 'Non Mappable' },
      synonyms: [],
    } as AniMedia);

    const service = createService();
    const result = await service.resolveTvdbId(90);

    expect(result).toBeNull();
    expect(pipelineSpy).not.toHaveBeenCalled();
    pipelineSpy.mockRestore();
  });
});
