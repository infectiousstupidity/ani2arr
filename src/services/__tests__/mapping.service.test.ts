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

type TestSafeLookupOptions = {
  canonicalKey?: string;
  forceNetwork?: boolean;
};

function getSafeLookup(
  service: MappingService,
): (
  term: string,
  credentials: { url: string; apiKey: string },
  options?: TestSafeLookupOptions,
) => Promise<SonarrLookupSeries[]> {
  const method = Reflect.get(service as unknown as Record<string, unknown>, 'safeLookup');
  if (typeof method !== 'function') {
    throw new Error('safeLookup not accessible');
  }
  return ((term, credentials, options) =>
    (method as (
      canonicalKey: string,
      rawDisplay: string,
      creds: { url: string; apiKey: string },
      opts?: { forceNetwork?: boolean },
    ) => Promise<SonarrLookupSeries[]>).call(
      service,
      options?.canonicalKey ?? '',
      term,
      credentials,
      options?.forceNetwork ? { forceNetwork: true } : undefined,
    )) as (
    term: string,
    credentials: { url: string; apiKey: string },
    options?: TestSafeLookupOptions,
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

  const createService = (overrides?: {
    delay?: (ms: number) => Promise<void>;
    lookupLimiter?: { maxConcurrent: number; spacingMs: number };
  }) =>
    new MappingService(sonarrApi, anilistApi, caches, {
      delay: overrides?.delay ?? (async () => {}),
      ...(overrides?.lookupLimiter ? { lookupLimiter: overrides.lookupLimiter } : {}),
    });

  it('resets lookup caches and inflight state when requested', async () => {
    const service = createService();
    const { positive, negative } = attachLookupCaches(service);

    const now = Date.now();
    positive.store.set('foo', { value: [], staleAt: now + 1, expiresAt: now + 2 });
    negative.store.set('bar', { value: true, staleAt: now + 1, expiresAt: now + 2 });

    const inflight = Reflect.get(service as unknown as Record<string, unknown>, 'inflight') as Map<
      number,
      unknown
    >;
    inflight.set(1, { promise: Promise.resolve({ tvdbId: 1 }), bypassFailureCache: false });

    const lookupInflight = Reflect.get(
      service as unknown as Record<string, unknown>,
      'lookupInflight',
    ) as Map<string, Promise<SonarrLookupSeries[]>>;
    lookupInflight.set('foo', Promise.resolve([]));

    await service.resetLookupState();

    expect(caches.failure.clear).toHaveBeenCalledTimes(1);
    expect(positive.clear).toHaveBeenCalledTimes(1);
    expect(negative.clear).toHaveBeenCalledTimes(1);
    expect(positive.store.size).toBe(0);
    expect(negative.store.size).toBe(0);
    expect(inflight.size).toBe(0);
    expect(lookupInflight.size).toBe(0);
  });

  it('limits concurrent Sonarr lookups through the shared limiter', async () => {
    const service = createService({
      lookupLimiter: { maxConcurrent: 2, spacingMs: 0 },
    });
    const safeLookup = getSafeLookup(service);
    const credentials = {
      url: baseOptions.sonarrUrl!,
      apiKey: baseOptions.sonarrApiKey!,
    };

    const pending: Array<ReturnType<typeof createDeferred<SonarrLookupSeries[]>>> = [];
    let active = 0;
    let maxActive = 0;

    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const deferred = createDeferred<SonarrLookupSeries[]>();
      pending.push(deferred);
      active += 1;
      maxActive = Math.max(maxActive, active);
      deferred.promise.finally(() => {
        active -= 1;
      });
      return deferred.promise;
    });

    const waitUntil = async (predicate: () => boolean, timeoutMs = 500) => {
      const timeoutAt = Date.now() + timeoutMs;
      while (!predicate()) {
        if (Date.now() > timeoutAt) {
          throw new Error('Timed out waiting for limiter condition');
        }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    };

    const lookups = ['Limiter 0', 'Limiter 1', 'Limiter 2', 'Limiter 3'].map(term =>
      safeLookup(term, credentials),
    );

    await waitUntil(() => pending.length === 2);
    expect((sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
    expect(maxActive).toBeLessThanOrEqual(2);

    const buildResult = (index: number): SonarrLookupSeries[] => [
      {
        tvdbId: 6100 + index,
        title: `Limiter ${index}`,
        year: 2020,
        genres: ['Anime'],
      },
    ];

    pending[0]!.resolve(buildResult(0));
    await waitUntil(() => pending.length >= 3);
    expect((sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(3);

    pending[1]!.resolve(buildResult(1));
    await waitUntil(() => pending.length >= 4);
    expect((sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(4);

    pending[2]!.resolve(buildResult(2));
    pending[3]!.resolve(buildResult(3));

    const results = await Promise.all(lookups);
    expect(results).toHaveLength(4);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('applies limiter spacing between sequential Sonarr lookups', async () => {
    const delayCalls: Array<{
      ms: number;
      deferred: ReturnType<typeof createDeferred<void>>;
    }> = [];
    const service = createService({
      delay: async ms => {
        const deferred = createDeferred<void>();
        delayCalls.push({ ms, deferred });
        return deferred.promise;
      },
      lookupLimiter: { maxConcurrent: 1, spacingMs: 125 },
    });
    const safeLookup = getSafeLookup(service);
    const credentials = {
      url: baseOptions.sonarrUrl!,
      apiKey: baseOptions.sonarrApiKey!,
    };

    const pending: Array<{
      index: number;
      deferred: ReturnType<typeof createDeferred<SonarrLookupSeries[]>>;
    }> = [];
    let callIndex = 0;

    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const deferred = createDeferred<SonarrLookupSeries[]>();
      const index = callIndex++;
      pending.push({ index, deferred });
      return deferred.promise;
    });

    const waitUntil = async (predicate: () => boolean, timeoutMs = 500) => {
      const timeoutAt = Date.now() + timeoutMs;
      while (!predicate()) {
        if (Date.now() > timeoutAt) {
          throw new Error('Timed out waiting for spacing condition');
        }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    };

    const lookups = ['Burst 0', 'Burst 1', 'Burst 2'].map(term => safeLookup(term, credentials));

    await waitUntil(() => pending.length === 1);
    expect(delayCalls).toHaveLength(0);
    expect((sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);

    const resolveResult = (entryIndex: number) => {
      const entry = pending[entryIndex];
      if (!entry) throw new Error(`Missing pending entry at index ${entryIndex}`);
      entry.deferred.resolve([
        {
          tvdbId: 6200 + entry.index,
          title: `Burst ${entry.index}`,
          year: 2020,
          genres: ['Anime'],
        },
      ]);
    };

    resolveResult(0);
    await waitUntil(() => delayCalls.length === 1);
    expect(delayCalls[0]!.ms).toBeGreaterThan(0);
    expect(delayCalls[0]!.ms).toBeLessThanOrEqual(125);
    expect(pending.length).toBe(1);
    expect((sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);

    delayCalls[0]!.deferred.resolve();
    await waitUntil(() => pending.length === 2);
    expect((sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);

    resolveResult(1);
    await waitUntil(() => delayCalls.length === 2);
    expect(delayCalls[1]!.ms).toBeGreaterThan(0);
    expect(delayCalls[1]!.ms).toBeLessThanOrEqual(125);
    expect(pending.length).toBe(2);
    expect((sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);

    delayCalls[1]!.deferred.resolve();
    await waitUntil(() => pending.length === 3);
    expect((sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(3);

    resolveResult(2);

    const results = await Promise.all(lookups);
    expect(results).toHaveLength(3);
    expect(delayCalls).toHaveLength(2);
    for (const call of delayCalls) {
      expect(call.ms).toBeGreaterThan(0);
      expect(call.ms).toBeLessThanOrEqual(125);
    }
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
      lookupLimiter: { maxConcurrent: 2, spacingMs: 0 },
    });

    const lookupsById = new Map<number, ReturnType<typeof createDeferred<SonarrLookupSeries[]>>>();
    const lookupOrder: number[] = [];
    let active = 0;
    let maxActive = 0;

      (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockImplementation(async term => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        const deferred = createDeferred<SonarrLookupSeries[]>();
        const idMatch = term.match(/\d+/);
        if (!idMatch) {
          throw new Error(`Unexpected lookup term: ${term}`);
        }
        const parsedId = Number(idMatch[0]);
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
    expect(maxActive).toBeLessThanOrEqual(2);

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

    await waitUntil(() => lookupsById.has(1), 2000);
    resolveLookupForId(1, 0);

    await waitUntil(() => delayCalls.length >= 1);
    expect(delayCalls[0]).toBe(1500);
    expect(delayResolvers).toHaveLength(1);
    expect(lookupOrder[0]).toBe(1);

    delayResolvers[0]!.resolve();
    await waitUntil(() => lookupsById.has(2), 2000);
    await waitUntil(() => lookupsById.has(3), 2000);
    resolveLookupForId(2, 1);
    resolveLookupForId(3, 2);
    await waitUntil(() => lookupsById.has(4), 2000);
    resolveLookupForId(4, 3);

    await waitUntil(() => delayCalls.length >= 2);
    expect(delayCalls[1]).toBe(1500);
    expect(delayResolvers).toHaveLength(2);
    delayResolvers[1]!.resolve();

    await waitUntil(() => lookupsById.has(5), 2000);
    resolveLookupForId(5, 4);

    expect(delayCalls.every(ms => ms === 1500)).toBe(true);
    expect(lookupOrder.length).toBeGreaterThanOrEqual(5);
    expect((sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(5);

    const results = await Promise.all(requests);
    expect(results).toHaveLength(5);
    expect(new Set(results.map(result => result.tvdbId)).size).toBe(5);

    scoreSpy.mockRestore();
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

  it('deduplicates punctuation and year variants into a single Sonarr lookup', async () => {
    const service = createService();
    const { positive } = attachLookupCaches(service);
    const safeLookup = getSafeLookup(service);

    const credentials = {
      url: baseOptions.sonarrUrl!,
      apiKey: baseOptions.sonarrApiKey!,
    };

    const resultPayload = [
      {
        tvdbId: 100,
        title: 'Naruto Shippuden',
        year: 2007,
        genres: ['Anime'],
      },
    ];

    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockResolvedValue(resultPayload);

    const first = await safeLookup('Naruto Shippuden 2007', credentials);
    expect(first).toEqual(resultPayload);
    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(1);
    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenNthCalledWith(
      1,
      'Naruto Shippuden 2007',
      credentials,
    );

    const second = await safeLookup('Naruto: Shippuden!!!', credentials);
    expect(second).toEqual(resultPayload);
    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(1);

    expect(Array.from(positive.store.keys())).toEqual(['naruto shippuden']);
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

    const first = await safeLookup('Bleach 2004', credentials);
    expect(first).toEqual([]);
    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(1);
    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenNthCalledWith(1, 'Bleach 2004', credentials);

    const second = await safeLookup('“Bleach” 2004', credentials);
    expect(second).toEqual([]);
    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(1);
  });

  it('reuses lookup cache entries across explicit years via canonical key', async () => {
    const service = createService();
    const { positive } = attachLookupCaches(service);
    const safeLookup = getSafeLookup(service);

    const credentials = {
      url: baseOptions.sonarrUrl!,
      apiKey: baseOptions.sonarrApiKey!,
    };

    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { tvdbId: 100, title: 'Bleach', year: 2004, genres: ['Anime'] },
      ])
      .mockResolvedValueOnce([
        { tvdbId: 200, title: 'Bleach (2024)', year: 2024, genres: ['Anime'] },
      ]);

    const first = await safeLookup('Bleach 2004', credentials);
    expect(first).toEqual([{ tvdbId: 100, title: 'Bleach', year: 2004, genres: ['Anime'] }]);
    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(1);
    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenNthCalledWith(1, 'Bleach 2004', credentials);

    const second = await safeLookup('Bleach 2024', credentials);
    expect(second).toEqual(first);
    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(1);

    expect(Array.from(positive.store.keys())).toEqual(['bleach']);
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

  it('allows forcing a second lookup for the same canonical key', async () => {
    const service = createService();
    attachLookupCaches(service);
    const safeLookup = getSafeLookup(service);

    const credentials = {
      url: baseOptions.sonarrUrl!,
      apiKey: baseOptions.sonarrApiKey!,
    };

    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { tvdbId: 100, title: 'Trigun Stampede', year: 2023, genres: ['Anime'] },
      ])
      .mockResolvedValueOnce([
        { tvdbId: 101, title: 'Trigun Stampede (Alt)', year: 2023, genres: ['Anime'] },
      ]);

    await safeLookup('Trigun Stampede', credentials);
    const forced = await safeLookup('Trigun Stampede 2023', credentials, { forceNetwork: true });

    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(2);
    expect(forced).toEqual([
      { tvdbId: 101, title: 'Trigun Stampede (Alt)', year: 2023, genres: ['Anime'] },
    ]);
  });

  it('performs a year retry when the initial score is weak', async () => {
    const service = createService();
    attachLookupCaches(service);

    const tryResolve = Reflect.get(
      service as unknown as Record<string, unknown>,
      'tryResolveWithPreparedMedia',
    ) as (
      anilistId: number,
      media: AniMedia,
      credentials: { url: string; apiKey: string },
      hints?: unknown,
    ) => Promise<ResolvedMapping | null>;

    const credentials = {
      url: baseOptions.sonarrUrl!,
      apiKey: baseOptions.sonarrApiKey!,
    };

    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockImplementation(async term => {
      if (term.includes('2020')) {
        return [
          { tvdbId: 2020, title: 'Shared Example', year: 2020, genres: ['Anime'] },
        ];
      }
      return [
        { tvdbId: 101, title: 'Shared Example (OVA)', year: 2019, genres: ['Anime'] },
      ];
    });

    const scoreSpy = vi
      .spyOn(matching, 'computeTitleMatchScore')
      .mockImplementation(params => {
        if (params.queryRaw === 'Shared Example' && params.candidateRaw === 'Shared Example') {
          return 1;
        }
        if (params.queryRaw.includes('2020')) {
          return 0.92;
        }
        return 0.78;
      });

    const media: AniMedia = {
      id: 5000,
      format: 'TV',
      title: { english: 'Shared Example' },
      synonyms: [],
      startDate: { year: 2020 },
    } as AniMedia;

    try {
      const result = await tryResolve.call(service, media.id, media, credentials);

      expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(2);
      expect(sonarrApi.lookupSeriesByTerm).toHaveBeenNthCalledWith(1, 'Shared Example', credentials);
      expect(sonarrApi.lookupSeriesByTerm).toHaveBeenNthCalledWith(
        2,
        'Shared Example 2020',
        credentials,
      );
      expect(result).toEqual({ tvdbId: 2020, successfulSynonym: 'Shared Example 2020' });

      const snapshot = getMetricsSnapshot();
      expect(snapshot.counters['mapping.lookup.year_probe']).toBe(1);
    } finally {
      scoreSpy.mockRestore();
    }
  });

  it('does not perform a year retry when the top score meets the threshold', async () => {
    const service = createService();
    attachLookupCaches(service);

    const tryResolve = Reflect.get(
      service as unknown as Record<string, unknown>,
      'tryResolveWithPreparedMedia',
    ) as (
      anilistId: number,
      media: AniMedia,
      credentials: { url: string; apiKey: string },
      hints?: unknown,
    ) => Promise<ResolvedMapping | null>;

    const credentials = {
      url: baseOptions.sonarrUrl!,
      apiKey: baseOptions.sonarrApiKey!,
    };

    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockResolvedValue([
      { tvdbId: 303, title: 'Strong Match Example', year: 2021, genres: ['Anime'] },
    ]);

    const scoreSpy = vi
      .spyOn(matching, 'computeTitleMatchScore')
      .mockImplementation(params => {
        if (
          params.queryRaw === 'Strong Match Example' &&
          params.candidateRaw === 'Strong Match Example'
        ) {
          return 0.84;
        }
        return 0.5;
      });

    const media: AniMedia = {
      id: 5001,
      format: 'TV',
      title: { english: 'Strong Match Example' },
      synonyms: [],
      startDate: { year: 2021 },
    } as AniMedia;

    try {
      const result = await tryResolve.call(service, media.id, media, credentials);

      expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(1);
      expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledWith('Strong Match Example', credentials);
      expect(result).toEqual({ tvdbId: 303, successfulSynonym: 'Strong Match Example' });

      const snapshot = getMetricsSnapshot();
      expect(snapshot.counters['mapping.lookup.year_probe']).toBeUndefined();
    } finally {
      scoreSpy.mockRestore();
    }
  });

  it('bypasses cached lookup entries when performing a year retry probe', async () => {
    const service = createService();
    const { positive } = attachLookupCaches(service);

    const tryResolve = Reflect.get(
      service as unknown as Record<string, unknown>,
      'tryResolveWithPreparedMedia',
    ) as (
      anilistId: number,
      media: AniMedia,
      credentials: { url: string; apiKey: string },
      hints?: unknown,
    ) => Promise<ResolvedMapping | null>;

    const credentials = {
      url: baseOptions.sonarrUrl!,
      apiKey: baseOptions.sonarrApiKey!,
    };

    const canonical = matching.canonicalizeLookupTerm('Vinland Saga');
    const cachedPayload: SonarrLookupSeries[] = [
      { tvdbId: 401, title: 'Vinland Saga', year: 2019, genres: ['Anime'] },
    ];
    if (canonical) {
      positive.store.set(canonical, {
        value: cachedPayload,
        staleAt: Date.now() + 10_000,
        expiresAt: Date.now() + 20_000,
      });
    }

    const scoreSpy = vi
      .spyOn(matching, 'computeTitleMatchScore')
      .mockImplementation(params => (params.queryRaw.includes('2023') ? 0.9 : 0.6));

    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockImplementation(async term => {
      if (!term.includes('2023')) {
        throw new Error(`unexpected base network call: ${term}`);
      }
      return [
        { tvdbId: 402, title: 'Vinland Saga Season 2', year: 2023, genres: ['Anime'] },
      ];
    });

    const media: AniMedia = {
      id: 5002,
      format: 'TV',
      title: { english: 'Vinland Saga' },
      synonyms: [],
      startDate: { year: 2023 },
    } as AniMedia;

    try {
      const result = await tryResolve.call(service, media.id, media, credentials);

      expect(result).toEqual({ tvdbId: 402, successfulSynonym: 'Vinland Saga 2023' });
      expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(1);
      expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledWith('Vinland Saga 2023', credentials);

      const snapshot = getMetricsSnapshot();
      expect(snapshot.counters['mapping.lookup.year_probe']).toBe(1);
    } finally {
      scoreSpy.mockRestore();
    }
  });

  it('reuses cached results for the same canonical term across different media within a session', async () => {
    const service = createService();
    attachLookupCaches(service);

    const tryResolve = Reflect.get(
      service as unknown as Record<string, unknown>,
      'tryResolveWithPreparedMedia',
    ) as (
      anilistId: number,
      media: AniMedia,
      credentials: { url: string; apiKey: string },
      hints?: unknown,
    ) => Promise<ResolvedMapping | null>;

    const credentials = {
      url: baseOptions.sonarrUrl!,
      apiKey: baseOptions.sonarrApiKey!,
    };

    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockResolvedValue([
      { tvdbId: 777, title: 'Shared Canonical Title', year: 2018, genres: ['Anime'] },
    ]);

    const mediaA: AniMedia = {
      id: 6001,
      format: 'TV',
      title: { english: 'Shared Canonical Title' },
      synonyms: ['Shared Canonical Title!'],
      startDate: { year: 2018 },
    } as AniMedia;

    const mediaB: AniMedia = {
      id: 6002,
      format: 'TV',
      title: { english: 'Shared Canonical Title' },
      synonyms: ['Shared Canonical Title?'],
      startDate: { year: 2018 },
    } as AniMedia;

    const first = await tryResolve.call(service, mediaA.id, mediaA, credentials);
    expect(first).toEqual({ tvdbId: 777, successfulSynonym: 'Shared Canonical Title' });
    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(1);

    const second = await tryResolve.call(service, mediaB.id, mediaB, credentials);
    expect(second).toEqual({ tvdbId: 777, successfulSynonym: 'Shared Canonical Title' });
    expect(sonarrApi.lookupSeriesByTerm).toHaveBeenCalledTimes(1);
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

      const normalized = matching.canonicalizeLookupTerm('Bleach');
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

      const normalized = matching.canonicalizeLookupTerm('Samurai Champloo');
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
      const id = Number(term.match(/\d+/)?.[0] ?? 0);
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
      .filter(entry => !entry.term.startsWith('__delay__'));

    const countsById = new Map<number, number>();
    for (const { term } of lookupsBySeries) {
      const id = Number(term.match(/\d+/)?.[0] ?? 0);
      countsById.set(id, (countsById.get(id) ?? 0) + 1);
    }

    expect(countsById.get(1)).toBe(5);
    expect(countsById.get(2)).toBe(5);
    expect(countsById.get(3)).toBe(5);
    expect(countsById.get(4)).toBe(5);

    const series4Indices = lookupsBySeries
      .filter(entry => Number(entry.term.match(/\d+/)?.[0] ?? 0) === 4)
      .map(entry => entry.index);
    expect(series4Indices.length).toBeGreaterThan(0);
    expect(Math.min(...series4Indices)).toBeGreaterThan(delayIndex);
  });

  it('skips lookup terms that canonicalize to ordinal tokens only', async () => {
    const lookupCalls: string[] = [];
    (sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>).mockImplementation(async term => {
      lookupCalls.push(term);
      if (term === 'Oshi no Ko') {
        return [
          {
            tvdbId: 182587,
            title: 'Oshi no Ko',
            year: 2023,
            genres: ['Anime'],
          },
        ];
      }
      return [];
    });

    const scoreSpy = vi.spyOn(matching, 'computeTitleMatchScore').mockImplementation(params => {
      if (params.queryRaw === 'Oshi no Ko') {
        return 0.9;
      }
      return 0.2;
    });

    (anilistApi.fetchMediaWithRelations as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 182587,
      format: 'TV',
      title: {
        english: '[Oshi no Ko] 3rd Season',
        romaji: 'Oshi no Ko 3rd Season',
      },
      synonyms: ['Oshi no Ko'],
      startDate: { year: 2023 },
      relations: { edges: [] },
    } as AniMedia);

    const service = createService();
    const result = await service.resolveTvdbId(182587);

    expect(result).toEqual({ tvdbId: 182587, successfulSynonym: 'Oshi no Ko' });
    expect(lookupCalls).toContain('Oshi no Ko');
    expect(lookupCalls).toContain('[Oshi no Ko] 3rd Season');
    expect(lookupCalls).not.toContain('3rd');
    expect(lookupCalls).not.toContain('3rd season');

    scoreSpy.mockRestore();
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

  it('short-circuits additional lookups once the initial term meets the score threshold', async () => {
    const scoreSpy = vi.spyOn(matching, 'computeTitleMatchScore').mockImplementation(params => {
      if (params.queryRaw === 'Series Base') {
        return 0.9;
      }
      return 0.1;
    });

    const lookupMock = sonarrApi.lookupSeriesByTerm as ReturnType<typeof vi.fn>;
    lookupMock.mockImplementation(async term => {
      if (term !== 'Series Base') {
        throw new Error(`unexpected lookup term: ${term}`);
      }
      return [
        {
          tvdbId: 7777,
          title: 'Series Base',
          year: 2020,
          genres: ['Anime'],
        },
      ];
    });

    (anilistApi.fetchMediaWithRelations as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 77,
      format: 'TV',
      title: { english: 'Series Base' },
      synonyms: ['Series Extra', 'Series Bonus'],
      startDate: { year: 2020 },
      relations: { edges: [] },
    } as AniMedia);

    const service = createService();
    const result = await service.resolveTvdbId(77);

    expect(result).toEqual({ tvdbId: 7777, successfulSynonym: 'Series Base' });
    expect(lookupMock).toHaveBeenCalledTimes(1);
    expect(lookupMock).toHaveBeenCalledWith('Series Base', expect.any(Object));

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
