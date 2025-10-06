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
import {
  defaultSonarrCredentials,
  testServer,
  createStaticMappingHandler,
  createSonarrLookupHandler,
  withLatency,
} from '@/testing';
import type { ExtensionOptions } from '@/types';
import { http, HttpResponse } from 'msw';
import { primaryMappingUrl } from '@/testing/fixtures/mappings';
import { extensionOptions } from '@/utils/storage';
import type { SonarrLookupSeries } from '@/types';
import { getMetricsSnapshot, resetMetrics } from '@/utils/metrics';

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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type LookupCacheEntry<T> = { value: T; staleAt: number; expiresAt: number; meta?: Record<string, unknown> };

function createInMemoryLookupCache<T>() {
  const store = new Map<string, LookupCacheEntry<T>>();

  const read = vi.fn(async (key: string) => {
    const entry = store.get(key);
    if (!entry) return null;
    const now = Date.now();
    if (now >= entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return {
      value: entry.value,
      stale: now >= entry.staleAt,
      staleAt: entry.staleAt,
      expiresAt: entry.expiresAt,
      ...(entry.meta ? { meta: entry.meta } : {}),
    } satisfies CacheHit<T>;
  });

  const write = vi.fn(async (key: string, value: T, options: CacheWriteOptions) => {
    const now = Date.now();
    store.set(key, {
      value,
      staleAt: now + options.staleMs,
      expiresAt: now + (options.hardMs ?? options.staleMs * 4),
      ...(options.meta ? { meta: options.meta } : {}),
    });
  });

  const remove = vi.fn(async (key: string) => {
    store.delete(key);
  });

  const clear = vi.fn(async () => {
    store.clear();
  });

  return { read, write, remove, clear, store } as CacheStub<T> & { store: Map<string, LookupCacheEntry<T>> };
}

function attachLookupCaches(service: MappingService) {
  const positive = createInMemoryLookupCache<SonarrLookupSeries[]>();
  const negative = createInMemoryLookupCache<boolean>();
  Object.defineProperty(service, 'lookupCache', {
    value: positive,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(service, 'negativeLookupCache', {
    value: negative,
    configurable: true,
    writable: true,
  });
  return { positive, negative };
}

function getSafeLookup(
  service: MappingService,
): (term: string, credentials: { url: string; apiKey: string }) => Promise<SonarrLookupSeries[]> {
  const method = Reflect.get(service as unknown as Record<string, unknown>, 'safeLookup');
  if (typeof method !== 'function') {
    throw new Error('safeLookup not accessible');
  }
  return method.bind(service) as (
    term: string,
    credentials: { url: string; apiKey: string },
  ) => Promise<SonarrLookupSeries[]>;
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
    resetMetrics();
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

  it('processQueue batches requests and waits between batches respecting the batch delay', async () => {
    const delayCalls: number[] = [];
    const delayResolvers: Array<ReturnType<typeof createDeferred<void>>> = [];
    const service = createService({
      delay: async ms => {
        delayCalls.push(ms);
        const deferred = createDeferred<void>();
        delayResolvers.push(deferred);
        return deferred.promise;
      },
    });

    const lookupsById = new Map<number, ReturnType<typeof createDeferred<SonarrLookupSeries[]>>>();
    const lookupOrder: number[] = [];
    let active = 0;
    let maxActive = 0;

    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockImplementation(async term => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const deferred = createDeferred<SonarrLookupSeries[]>();
      const idMatch = term.match(/Series (\d+)/);
      if (!idMatch) {
        throw new Error(`Unexpected lookup term: ${term}`);
      }
      const parsedId = Number(idMatch[1]);
      lookupOrder.push(parsedId);
      lookupsById.set(parsedId, deferred);
      const results = await deferred.promise;
      active -= 1;
      return results;
    });

    (anilistApi.fetchMediaWithRelations as ReturnType<typeof vi.fn>).mockImplementation(async (id: number) => ({
      id,
      format: 'TV',
      title: { english: `Series ${id}`, romaji: `Series ${id}` },
      synonyms: [],
      startDate: { year: 2020 },
      relations: { edges: [] },
    }) as AniMedia);

    const scoreSpy = vi.spyOn(matching, 'computeTitleMatchScore').mockImplementation(() => 0.9);

    const waitUntil = async (predicate: () => boolean, timeoutMs = 500) => {
      const timeoutAt = Date.now() + timeoutMs;
      while (!predicate()) {
        if (Date.now() > timeoutAt) {
          throw new Error(`Timed out waiting for condition; lookupOrder=${JSON.stringify(lookupOrder)}`);
        }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    };

    const requests = [1, 2, 3, 4, 5].map(id => service.resolveTvdbId(id));
    await waitUntil(() => lookupOrder.length >= 1);

    expect(maxActive).toBeGreaterThanOrEqual(1);

    const resolveLookupForId = (id: number, index: number) => {
      const deferred = lookupsById.get(id);
      if (!deferred) throw new Error(`Missing lookup entry for id ${id}`);
      lookupsById.delete(id);
      deferred.resolve([
        {
          tvdbId: 5000 + index,
          title: `Series ${id}`,
          year: 2020,
          genres: ['Anime'],
        },
      ]);
    };

    resolveLookupForId(1, 0);
    await waitUntil(() => delayCalls.length === 1);
    expect(delayCalls).toEqual([1500]);
    expect(delayResolvers).toHaveLength(1);
    expect((sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);

  delayResolvers[0]!.resolve();
    await waitUntil(() => lookupOrder.length >= 4);
    await waitUntil(() => lookupsById.has(2));
    await waitUntil(() => lookupsById.has(3));
    await waitUntil(() => lookupsById.has(4));

    resolveLookupForId(2, 1);
    resolveLookupForId(3, 2);
    resolveLookupForId(4, 3);

    await waitUntil(() => delayCalls.length === 2);
    expect(delayCalls).toEqual([1500, 1500]);
    expect(delayResolvers).toHaveLength(2);
  delayResolvers[1]!.resolve();

    await waitUntil(() => lookupOrder.length >= 5);
    await waitUntil(() => lookupsById.has(5));

    expect((sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(5);
    resolveLookupForId(5, 4);

    const results = await Promise.all(requests);
    expect(results).toHaveLength(5);
    expect(new Set(results.map(result => result.tvdbId)).size).toBe(5);

    scoreSpy.mockRestore();
  });

  it('drops network resolutions when the provided signal aborts before lookup begins', async () => {
    const service = createService();

    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('lookup should not be called for cancelled work');
    });

    const controller = new AbortController();

    const promise = service.resolveTvdbId(42, { signal: controller.signal });

    await Promise.resolve();
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });

    expect(sonarrApi.lookupSeriesByTerm).not.toHaveBeenCalled();
    expect(anilistApi.fetchMediaWithRelations).not.toHaveBeenCalled();
    expect(caches.success.write).not.toHaveBeenCalled();
    expect(caches.failure.write).not.toHaveBeenCalled();
  });

  it('does not populate lookup caches when a lookup aborts mid-flight', async () => {
    const service = createService();
    const lookupCaches = attachLookupCaches(service);

    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockImplementation(
      (_term: string, _credentials, signal?: AbortSignal) => {
        const deferred = createDeferred<SonarrLookupSeries[]>();
        signal?.addEventListener(
          'abort',
          () => {
            const reason = signal.reason;
            deferred.reject(reason instanceof Error ? reason : new DOMException('The operation was aborted.', 'AbortError'));
          },
          { once: true },
        );
        return deferred.promise;
      },
    );

    const controller = new AbortController();
    const promise = service.resolveTvdbId(43, { signal: controller.signal });

    await Promise.resolve();
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });

    expect(lookupCaches.positive.write).not.toHaveBeenCalled();
    expect(lookupCaches.negative.write).not.toHaveBeenCalled();
  });

  it('honors MSW withLatency delays before resolving Sonarr lookups', async () => {
    vi.useFakeTimers();
    const latencyMs = 320;

    const sonarrCalls: string[] = [];
    testServer.use(
      createSonarrLookupHandler({
        results: [
          {
            tvdbId: 9100,
            title: 'Latency Check',
            year: 2020,
            genres: ['Anime'],
          },
        ],
        ...withLatency(latencyMs),
      }),
    );

    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockImplementation(async (term, credentials) => {
      sonarrCalls.push(term);
      const encoded = encodeURIComponent(term);
      const response = await fetch(
        `${credentials.url.replace(/\/$/, '')}/api/v3/series/lookup?term=${encoded}`,
      );
      if (!response.ok) {
        throw createError(ErrorCode.NETWORK_ERROR, `Lookup failed (${response.status})`, 'Lookup failed');
      }
      return (await response.json()) as SonarrLookupSeries[];
    });

    (anilistApi.fetchMediaWithRelations as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 910,
      format: 'TV',
      title: { english: 'Latency Check', romaji: 'Latency Check' },
      synonyms: [],
      startDate: { year: 2020 },
      relations: { edges: [] },
    } as AniMedia);

    const scoreSpy = vi.spyOn(matching, 'computeTitleMatchScore').mockImplementation(() => 0.9);

    try {
      const service = createService();
      attachLookupCaches(service);
      const promise = service.resolveTvdbId(910);

      let settled = false;
      promise.then(() => {
        settled = true;
      });

      await Promise.resolve();
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(latencyMs);
      const result = await promise;

      expect(result).toEqual({ tvdbId: 9100, successfulSynonym: 'Latency Check' });
      expect(sonarrCalls).toEqual(['Latency Check']);
    } finally {
      scoreSpy.mockRestore();
      vi.useRealTimers();
    }
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

  it('uses Sonarr lookup cache for normalized terms', async () => {
    const service = createService();
    attachLookupCaches(service);
    const safeLookup = getSafeLookup(service);

    const credentials = {
      url: baseOptions.sonarrUrl!,
      apiKey: baseOptions.sonarrApiKey!,
    };

    const resultPayload = [
      {
        tvdbId: 100,
        title: 'Naruto',
        year: 2002,
        genres: ['Anime'],
      },
    ];

    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockResolvedValue(resultPayload);

    const first = await safeLookup('  Naruto  ', credentials);
    expect(first).toEqual(resultPayload);
    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(1);

    const second = await safeLookup('naruto', credentials);
    expect(second).toEqual(resultPayload);
    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(1);
  });

  it('uses negative Sonarr lookup cache when no results returned', async () => {
    const service = createService();
    attachLookupCaches(service);
    const safeLookup = getSafeLookup(service);

    const credentials = {
      url: baseOptions.sonarrUrl!,
      apiKey: baseOptions.sonarrApiKey!,
    };

    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const first = await safeLookup('Bleach', credentials);
    expect(first).toEqual([]);
    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(1);

    const second = await safeLookup('BLEACH', credentials);
    expect(second).toEqual([]);
    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(1);
  });

  it('shares inflight Sonarr lookups for the same normalized term', async () => {
    const service = createService();
    attachLookupCaches(service);
    const safeLookup = getSafeLookup(service);

    const credentials = {
      url: baseOptions.sonarrUrl!,
      apiKey: baseOptions.sonarrApiKey!,
    };

    const deferred = createDeferred<SonarrLookupSeries[]>();
    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockReturnValue(deferred.promise);

    const firstPromise = safeLookup('Fullmetal Alchemist', credentials);
    const inflightMap = (service as unknown as { lookupInflight: Map<string, Promise<SonarrLookupSeries[]>> }).lookupInflight;
    expect(inflightMap).toBeInstanceOf(Map);
    await Promise.resolve();
    await Promise.resolve();
    expect(inflightMap.size).toBe(1);
    const secondPromise = safeLookup('fullmetal alchemist', credentials);
    await Promise.resolve();
    await Promise.resolve();

    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(1);

    const payload = [
      {
        tvdbId: 200,
        title: 'Fullmetal Alchemist',
        year: 2003,
        genres: ['Anime'],
      },
    ];
    deferred.resolve(payload);

    await expect(firstPromise).resolves.toEqual(payload);
    await expect(secondPromise).resolves.toEqual(payload);
  });

  describe('metrics instrumentation', () => {
    it('increments cache hit counter when a positive lookup cache entry is reused', async () => {
      const service = createService();
      const { positive } = attachLookupCaches(service);
      const safeLookup = getSafeLookup(service);

      const credentials = {
        url: baseOptions.sonarrUrl!,
        apiKey: baseOptions.sonarrApiKey!,
      };

      const normalized = matching.normTitle('Bleach');
      const payload = [
        {
          tvdbId: 101,
          title: 'Bleach',
          year: 2004,
          genres: ['Anime'],
        },
      ];
      if (normalized) {
        positive.store.set(normalized, {
          value: payload,
          staleAt: Date.now() + 10_000,
          expiresAt: Date.now() + 20_000,
        });
      }

      const results = await safeLookup('Bleach', credentials);

      expect(results).toEqual(payload);
      expect(sonarrApi.lookupSeriesByTerm).not.toHaveBeenCalled();
      const snapshot = getMetricsSnapshot();
      expect(snapshot.counters['mapping.lookup.cache_hit']).toBe(1);
      expect(snapshot.counters['mapping.lookup.network_miss']).toBeUndefined();
    });

    it('increments negative cache counter when cached misses are reused', async () => {
      const service = createService();
      const { negative } = attachLookupCaches(service);
      const safeLookup = getSafeLookup(service);

      const credentials = {
        url: baseOptions.sonarrUrl!,
        apiKey: baseOptions.sonarrApiKey!,
      };

      const normalized = matching.normTitle('Samurai Champloo');
      if (normalized) {
        negative.store.set(normalized, {
          value: true,
          staleAt: Date.now() + 10_000,
          expiresAt: Date.now() + 20_000,
        });
      }

      const results = await safeLookup('Samurai Champloo', credentials);

      expect(results).toEqual([]);
      expect(sonarrApi.lookupSeriesByTerm).not.toHaveBeenCalled();
      const snapshot = getMetricsSnapshot();
      expect(snapshot.counters['mapping.lookup.negative_cache_hit']).toBe(1);
      expect(snapshot.counters['mapping.lookup.network_miss']).toBeUndefined();
    });

    it('counts inflight reuse while sharing the same pending lookup', async () => {
      const service = createService();
      attachLookupCaches(service);
      const safeLookup = getSafeLookup(service);

      const credentials = {
        url: baseOptions.sonarrUrl!,
        apiKey: baseOptions.sonarrApiKey!,
      };

      const deferred = createDeferred<SonarrLookupSeries[]>();
      (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockReturnValueOnce(deferred.promise);

      const firstPromise = safeLookup('Fullmetal Alchemist', credentials);
      await Promise.resolve();
      const secondPromise = safeLookup('fullmetal alchemist', credentials);
      await Promise.resolve();

      const payload = [
        {
          tvdbId: 200,
          title: 'Fullmetal Alchemist',
          year: 2003,
          genres: ['Anime'],
        },
      ];
      deferred.resolve(payload);

      await expect(firstPromise).resolves.toEqual(payload);
      await expect(secondPromise).resolves.toEqual(payload);

      const snapshot = getMetricsSnapshot();
      expect(snapshot.counters['mapping.lookup.inflight_reuse']).toBe(1);
      expect(snapshot.counters['mapping.lookup.network_miss']).toBe(1);
    });

    it('records network misses and lookup latency when performing Sonarr lookups', async () => {
      const service = createService();
      attachLookupCaches(service);
      const safeLookup = getSafeLookup(service);

      const credentials = {
        url: baseOptions.sonarrUrl!,
        apiKey: baseOptions.sonarrApiKey!,
      };

      const payload = [
        {
          tvdbId: 555,
          title: 'Trigun Stampede',
          year: 2023,
          genres: ['Anime'],
        },
      ];
      (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockResolvedValueOnce(payload);

      const results = await safeLookup('Trigun Stampede', credentials);

      expect(results).toEqual(payload);
      const snapshot = getMetricsSnapshot();
      expect(snapshot.counters['mapping.lookup.network_miss']).toBe(1);
      const histogram = snapshot.histograms['mapping.lookup.latency'];
      expect(histogram?.count).toBe(1);
    });
  });

  it('refreshes Sonarr lookup cache after TTL expiry', async () => {
    vi.useFakeTimers();

    try {
      const service = createService();
      attachLookupCaches(service);
      const safeLookup = getSafeLookup(service);

      const credentials = {
        url: baseOptions.sonarrUrl!,
        apiKey: baseOptions.sonarrApiKey!,
      };

      const payload = [
        {
          tvdbId: 300,
          title: 'One Piece',
          year: 1999,
          genres: ['Anime'],
        },
      ];

      (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockResolvedValue(payload);

      const first = await safeLookup('One Piece', credentials);
      expect(first).toEqual(payload);
      expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(1);

      const softTtlMs = 10 * 60 * 1000;
      await vi.advanceTimersByTimeAsync(softTtlMs + 1);

      const second = await safeLookup('one piece', credentials);
      await Promise.resolve();
      expect(second).toEqual(payload);
      expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
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

  it('hydrates fallback static mappings when the primary table lacks a match', async () => {
    caches.staticPrimary.read.mockResolvedValue({
      value: { pairs: {} },
      stale: false,
      staleAt: Date.now() + 1,
      expiresAt: Date.now() + 2,
    });
    caches.staticFallback.read.mockResolvedValue({
      value: { pairs: { 888: 444 } },
      stale: false,
      staleAt: Date.now() + 1,
      expiresAt: Date.now() + 2,
    });

    testServer.use(
      createStaticMappingHandler('primary', { body: { pairs: {} } }),
      createStaticMappingHandler('fallback', { body: { pairs: { 888: 444 } } }),
    );

    const service = createService();
    await service.initStaticPairs();

    const result = await service.resolveTvdbId(888);

    expect(result).toEqual({ tvdbId: 444 });
    expect(caches.success.write).toHaveBeenCalledWith('resolved:888', { tvdbId: 444 }, {
      staleMs: 30 * 24 * 60 * 60 * 1000,
      hardMs: 180 * 24 * 60 * 60 * 1000,
    });
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


  it('skips failure caching for validation errors but caches network and configuration errors with TTLs', async () => {
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

    const configError = createError(ErrorCode.CONFIGURATION_ERROR, 'config', 'Config');
    lookupMock.mockReset();
    lookupMock.mockRejectedValue(configError);

    await expect(service.resolveTvdbId(44)).rejects.toEqual(configError);
    expect(caches.failure.write).toHaveBeenCalledTimes(2);
    expect(caches.failure.write).toHaveBeenLastCalledWith('resolved-failure:44', configError, {
      staleMs: 30 * 60 * 1000,
      hardMs: 60 * 60 * 1000,
    });
  });

  it('bypasses cached failures when ignoreFailureCache is true and performs a fresh Sonarr lookup', async () => {
    const cachedError = createError(ErrorCode.NETWORK_ERROR, 'cached', 'Cached');
    caches.failure.read.mockResolvedValue({
      value: cachedError,
      stale: false,
      staleAt: Date.now() + 1,
      expiresAt: Date.now() + 2,
    });

    const service = createService();

    await expect(service.resolveTvdbId(501)).rejects.toEqual(cachedError);
    expect(caches.failure.read).toHaveBeenCalledTimes(1);

    caches.failure.read.mockReset();
    caches.failure.read.mockImplementation(async () => {
      throw new Error('failure cache should have been bypassed');
    });

    const sonarrCalls: string[] = [];
    testServer.use(
      createSonarrLookupHandler({
        results: [
          {
            tvdbId: 9501,
            title: 'Fresh Hit',
            year: 2021,
            genres: ['Anime'],
          },
        ],
        ...withLatency(25),
      }),
    );

    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockImplementation(async (term, credentials) => {
      sonarrCalls.push(term);
      const encoded = encodeURIComponent(term);
      const response = await fetch(
        `${credentials.url.replace(/\/$/, '')}/api/v3/series/lookup?term=${encoded}`,
      );
      if (!response.ok) {
        throw createError(ErrorCode.NETWORK_ERROR, `Lookup failed (${response.status})`, 'Lookup failed');
      }
      return (await response.json()) as SonarrLookupSeries[];
    });

    (anilistApi.fetchMediaWithRelations as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 501,
      format: 'TV',
      title: { english: 'Fresh Hit', romaji: 'Fresh Hit' },
      synonyms: [],
      startDate: { year: 2021 },
      relations: { edges: [] },
    } as AniMedia);

    const scoreSpy = vi.spyOn(matching, 'computeTitleMatchScore').mockImplementation(() => 0.9);

    const result = await service.resolveTvdbId(501, { ignoreFailureCache: true });

    expect(result).toEqual({ tvdbId: 9501, successfulSynonym: 'Fresh Hit' });
    expect(sonarrCalls).toEqual(['Fresh Hit']);
    expect(caches.failure.write).not.toHaveBeenCalled();

    scoreSpy.mockRestore();
  });

  it('short-circuits network resolution when a hint lookup succeeds', async () => {
    const scoreSpy = vi.spyOn(matching, 'computeTitleMatchScore').mockImplementation(() => 0.9);
    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockImplementation(async term => {
      expect(term).toBe('Hint Title');
      return [
        {
          tvdbId: 6400,
          title: term,
          year: 2020,
          genres: ['Anime'],
        },
      ];
    });

    const service = createService();

    const result = await service.resolveTvdbId(640, { hints: { primaryTitle: 'Hint Title' } });

    expect(result).toEqual({ tvdbId: 6400, successfulSynonym: 'Hint Title' });
    expect(caches.success.write).toHaveBeenCalledWith('resolved:640', { tvdbId: 6400, successfulSynonym: 'Hint Title' }, {
      staleMs: 30 * 24 * 60 * 60 * 1000,
      hardMs: 180 * 24 * 60 * 60 * 1000,
    });
    expect(anilistApi.fetchMediaWithRelations).not.toHaveBeenCalled();

    scoreSpy.mockRestore();
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

  it('traverses prequel relations to reuse static mappings', async () => {
    const deepPrequel: AniMedia = {
      id: 110,
      format: 'TV',
      title: { english: 'Deep Prequel', romaji: 'Deep Prequel' },
      synonyms: [],
      startDate: { year: 2005 },
      relations: { edges: [] },
    } as AniMedia;

    const midPrequel: AniMedia = {
      id: 120,
      format: 'TV',
      title: { english: 'Mid Prequel', romaji: 'Mid Prequel' },
      synonyms: [],
      startDate: { year: 2010 },
      relations: { edges: [{ relationType: 'PREQUEL', node: deepPrequel }] },
    } as AniMedia;

    const root: AniMedia = {
      id: 130,
      format: 'TV',
      title: { english: 'Root Series', romaji: 'Root Series' },
      synonyms: [],
      startDate: { year: 2015 },
      relations: { edges: [{ relationType: 'PREQUEL', node: midPrequel }] },
    } as AniMedia;

    caches.staticPrimary.read.mockResolvedValue({
      value: { pairs: { 110: 4110 } },
      stale: false,
      staleAt: Date.now() + 1,
      expiresAt: Date.now() + 2,
    });
    caches.staticFallback.read.mockResolvedValue({
      value: { pairs: {} },
      stale: false,
      staleAt: Date.now() + 1,
      expiresAt: Date.now() + 2,
    });

    (anilistApi.fetchMediaWithRelations as ReturnType<typeof vi.fn>).mockResolvedValue(root);

    const service = createService();
    await service.initStaticPairs();

    const result = await service.resolveTvdbId(130);

    expect(result).toEqual({ tvdbId: 4110 });
    expect(sonarrApi.lookupSeriesByTerm).not.toHaveBeenCalled();
  });

  it('returns the synonym responsible for the winning Sonarr score', async () => {
    const scoreSpy = vi
      .spyOn(matching, 'computeTitleMatchScore')
      .mockImplementation(params => (params.queryRaw.includes('Secondary') ? 0.88 : 0.7));

    testServer.use(
      createSonarrLookupHandler({
        results: [
          {
            tvdbId: 9777,
            title: 'Secondary Title',
            year: 2020,
            genres: ['Anime'],
          },
        ],
      }),
    );

    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockImplementation(async (term, credentials) => {
      const encoded = encodeURIComponent(term);
      const response = await fetch(
        `${credentials.url.replace(/\/$/, '')}/api/v3/series/lookup?term=${encoded}`,
      );
      if (!response.ok) {
        throw createError(ErrorCode.NETWORK_ERROR, `Lookup failed (${response.status})`, 'Lookup failed');
      }
      return (await response.json()) as SonarrLookupSeries[];
    });

    (anilistApi.fetchMediaWithRelations as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 977,
      format: 'TV',
      title: { english: 'Primary Title', romaji: 'Primary Title' },
      synonyms: ['Secondary Title'],
      startDate: { year: 2020 },
      relations: { edges: [] },
    } as AniMedia);

    const service = createService();
    const result = await service.resolveTvdbId(977);

    expect(result).toEqual({ tvdbId: 9777, successfulSynonym: 'Secondary Title' });

    scoreSpy.mockRestore();
  });
});
