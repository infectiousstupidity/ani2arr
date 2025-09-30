// src/services/__tests__/mapping.service.test.ts
const noop = () => {};
process.on('unhandledRejection', noop);

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CacheHit, CacheWriteOptions, TtlCache } from '@/cache';
import type { AnilistApiService, AniMedia } from '@/api/anilist.api';
import type { SonarrApiService } from '@/api/sonarr.api';
import type { StaticMappingPayload } from '@/services/mapping.service';
import { MappingService, type ResolvedMapping } from '@/services/mapping.service';
import { createError, ErrorCode } from '@/utils/error-handling';
import * as matching from '@/utils/matching';
import { defaultSonarrCredentials, testServer, createStaticMappingHandler } from '@/testing';
import type { ExtensionOptions } from '@/types';
import { http, HttpResponse } from 'msw';
import { primaryMappingUrl } from '@/testing/fixtures/mappings';
import { extensionOptions } from '@/utils/storage';

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
  sonarrUrl: defaultSonarrCredentials.url,
  sonarrApiKey: defaultSonarrCredentials.apiKey,
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

describe('MappingService', () => {
  let sonarrApi: SonarrApiService;
  let anilistApi: AnilistApiService;
  let caches: {
    success: CacheStub<ResolvedMapping>;
    failure: CacheStub<ReturnType<typeof createError>>;
    staticPrimary: CacheStub<StaticMappingPayload>;
    staticFallback: CacheStub<StaticMappingPayload>;
  };

  beforeEach(() => {
    sonarrApi = {
      lookupSeriesByTerm: vi.fn(),
    } as unknown as SonarrApiService;
    anilistApi = {
      fetchMediaWithRelations: vi.fn(),
    } as unknown as AnilistApiService;
    caches = {
      success: createCacheStub<ResolvedMapping>(),
      failure: createCacheStub<ReturnType<typeof createError>>(),
      staticPrimary: createCacheStub<StaticMappingPayload>(),
      staticFallback: createCacheStub<StaticMappingPayload>(),
    };
    vi.spyOn(extensionOptions, 'getValue').mockResolvedValue(baseOptions);
  });

  const createService = (overrides?: { delay?: (ms: number) => Promise<void> }) =>
    new MappingService(sonarrApi, anilistApi, caches, {
      delay: overrides?.delay ?? (async () => {}),
    });

  it('returns cached mapping without hitting APIs when success cache hits', async () => {
    const cached: CacheHit<ResolvedMapping> = {
      value: { tvdbId: 321, successfulSynonym: 'cached' },
      stale: false,
      staleAt: Date.now() + 1,
      expiresAt: Date.now() + 2,
    };
    caches.success.read.mockResolvedValueOnce(cached);

    const service = createService();

    const result = await service.resolveTvdbId(1010);

    expect(result).toEqual(cached.value);
    expect(caches.success.read).toHaveBeenCalledWith('resolved:1010');
    expect(caches.failure.read).not.toHaveBeenCalled();
    expect(anilistApi.fetchMediaWithRelations).not.toHaveBeenCalled();
    expect(sonarrApi.lookupSeriesByTerm).not.toHaveBeenCalled();
  });

  it('throws cached failure unless ignoreFailureCache is true', async () => {
    const error = createError(ErrorCode.API_ERROR, 'boom', 'Boom');
    const hit: CacheHit<typeof error> = {
      value: error,
      stale: false,
      staleAt: Date.now() + 1,
      expiresAt: Date.now() + 2,
    };
    caches.failure.read.mockResolvedValueOnce(hit);

    const service = createService();

    await expect(service.resolveTvdbId(2020)).rejects.toEqual(error);
    expect(caches.failure.read).toHaveBeenCalledWith('resolved-failure:2020');

    caches.failure.read.mockClear();
    const bypassService = createService();

    await expect(bypassService.resolveTvdbId(2020, { ignoreFailureCache: true })).rejects.not.toBeNull();
    expect(caches.failure.read).not.toHaveBeenCalled();
  });

  it('hydrates static pairs and writes resolved TTL metadata when static mapping exists', async () => {
    const staticHit: CacheHit<StaticMappingPayload> = {
      value: { pairs: { 555: 999 } },
      stale: false,
      staleAt: Date.now() + 1,
      expiresAt: Date.now() + 2,
      meta: { etag: 'etag-1' },
    };
    caches.staticPrimary.read.mockResolvedValueOnce(staticHit);
    caches.staticFallback.read.mockResolvedValue({
      value: { pairs: {} },
      stale: false,
      staleAt: Date.now() + 1,
      expiresAt: Date.now() + 2,
    });

    testServer.use(
      createStaticMappingHandler('primary', { body: staticHit.value, headers: { ETag: 'etag-1' } }),
      createStaticMappingHandler('fallback', { body: { pairs: {} } }),
    );

    const service = createService();
    await service.initStaticPairs();

    const result = await service.resolveTvdbId(555);

    expect(result).toEqual({ tvdbId: 999 });
    expect(caches.success.write).toHaveBeenCalledWith('resolved:555', { tvdbId: 999 }, {
      staleMs: 30 * 24 * 60 * 60 * 1000,
      hardMs: 180 * 24 * 60 * 60 * 1000,
    });
    expect(anilistApi.fetchMediaWithRelations).not.toHaveBeenCalled();
    expect(sonarrApi.lookupSeriesByTerm).not.toHaveBeenCalled();
  });

  it('dedupes inflight requests and prefers best scoring synonym', async () => {
    const scoreSpy = vi.spyOn(matching, 'computeTitleMatchScore');
    scoreSpy.mockImplementation(params => {
      if (params.queryRaw.includes('best')) return 0.9;
      if (params.queryRaw.includes('alt')) return 0.78;
      return 0.2;
    });

    const lookupCalls: string[] = [];
    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockImplementation(async term => {
      lookupCalls.push(term);
      const id = Number(term.match(/Series (\d+)/)?.[1] ?? 0);
      return [
        {
          tvdbId: 8000 + id,
          title: term,
          year: 2020,
          genres: ['Anime'],
        },
      ];
    });

    (anilistApi.fetchMediaWithRelations as ReturnType<typeof vi.fn>).mockImplementation(async (id: number) => ({
      id,
      format: 'TV',
      title: { english: `Series ${id} base`, romaji: `Series ${id} base` },
      synonyms: [`Series ${id} alt`, `Series ${id} best`],
      startDate: { year: 2020 },
      relations: { edges: [] },
    }) as AniMedia);

    const service = createService({
      delay: async ms => {
        lookupCalls.push(`__delay__${ms}`);
      },
    });

    const p1 = service.resolveTvdbId(1);
    const p1b = service.resolveTvdbId(1);
    const p2 = service.resolveTvdbId(2);
    const p3 = service.resolveTvdbId(3);
    const p4 = service.resolveTvdbId(4);

    expect(p1b).toBe(p1);

    const [r1, r2, r3, r4] = await Promise.all([p1, p2, p3, p4]);

    expect(r1).toEqual({ tvdbId: 8001, successfulSynonym: 'Series 1 best' });
    expect(r2).toEqual({ tvdbId: 8002, successfulSynonym: 'Series 2 best' });
    expect(r3).toEqual({ tvdbId: 8003, successfulSynonym: 'Series 3 best' });
    expect(r4).toEqual({ tvdbId: 8004, successfulSynonym: 'Series 4 best' });

    const delayIndex = lookupCalls.findIndex(term => term.startsWith('__delay__'));
    expect(delayIndex).toBeGreaterThanOrEqual(0);

    const lookupsBySeries = lookupCalls
      .map((term, index) => ({ term, index }))
      .filter(entry => entry.term.startsWith('Series'));

    const countsById = new Map<number, number>();
    for (const { term } of lookupsBySeries) {
      const id = Number(term.match(/Series (\d+)/)?.[1] ?? 0);
      countsById.set(id, (countsById.get(id) ?? 0) + 1);
    }

    expect(countsById.get(1) ?? 0).toBeGreaterThanOrEqual(5);
    expect(countsById.get(2) ?? 0).toBeGreaterThanOrEqual(5);
    expect(countsById.get(3) ?? 0).toBeGreaterThanOrEqual(5);
    expect(countsById.get(4) ?? 0).toBeGreaterThanOrEqual(5);

    const series4Indices = lookupsBySeries
      .filter(entry => entry.term.includes('Series 4'))
      .map(entry => entry.index);
    expect(series4Indices.length).toBeGreaterThan(0);
    expect(Math.min(...series4Indices)).toBeGreaterThan(delayIndex);
  });


  it('skips failure caching for validation errors but caches network errors with shorter TTLs', async () => {
    const validationError = createError(ErrorCode.VALIDATION_ERROR, 'invalid', 'Invalid');
    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockRejectedValue(validationError);
    (anilistApi.fetchMediaWithRelations as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 42,
      format: 'TV',
      title: { english: 'Series 42 base', romaji: 'Series 42 base' },
      synonyms: ['Series 42 alt'],
      startDate: { year: 2020 },
      relations: { edges: [] },
    } as AniMedia);

    const service = createService();

    await expect(service.resolveTvdbId(42, { ignoreFailureCache: true })).rejects.toEqual(validationError);
    expect(caches.failure.write).not.toHaveBeenCalled();

    const networkError = createError(ErrorCode.NETWORK_ERROR, 'network', 'Network');
    const lookupMock = sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>;
    lookupMock.mockReset();
    lookupMock.mockRejectedValue(networkError);

    await expect(service.resolveTvdbId(43)).rejects.toEqual(networkError);
    expect(caches.failure.write).toHaveBeenCalledTimes(1);
    expect(caches.failure.write).toHaveBeenCalledWith('resolved-failure:43', networkError, {
      staleMs: 5 * 60 * 1000,
      hardMs: 15 * 60 * 1000,
    });
  });

  it('throws when network access disabled and no static mapping exists', async () => {
    const service = createService();

    await expect(service.resolveTvdbId(9999, { network: 'never' })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('hydrates from cached payload when static refresh responds with 304 and ETag', async () => {
    const etag = 'cached-etag';
    caches.staticPrimary.read.mockResolvedValue({
      value: { pairs: { 777: 333 } },
      stale: false,
      staleAt: Date.now() + 1,
      expiresAt: Date.now() + 2,
      meta: { etag },
    });
    caches.staticFallback.read.mockResolvedValue(null);

    const ifNoneMatchHeaders: Array<string | null> = [];
    testServer.use(
      http.get(primaryMappingUrl, async ({ request }) => {
        ifNoneMatchHeaders.push(request.headers.get('if-none-match'));
        return HttpResponse.json({ pairs: { 777: 333 } }, { status: 304, headers: { ETag: etag } });
      }),
    );

    const service = createService();
    await (service as unknown as { refreshStaticMapping(type: 'primary' | 'fallback'): Promise<void> }).refreshStaticMapping(
      'primary',
    );

    const result = await service.resolveTvdbId(777);

    expect(ifNoneMatchHeaders).toContain(etag);
    expect(result).toEqual({ tvdbId: 333 });
    expect(caches.staticPrimary.write).not.toHaveBeenCalled();
  });
});
