/** Tests for source-aware upstream mapping parsing and reverse lookup behavior. */
// src/mapping/upstream/upstream-mapping.store.test.ts

import { describe, expect, it } from 'vitest';
import type { TtlCache, CacheHit, CacheWriteOptions } from '@/storage/ttl-cache';
import { UpstreamMappingStore, type UpstreamMappingPayload } from './upstream-mapping.store';

type MemoryCache<T> = TtlCache<T> & {
  peek(key: string): CacheHit<T> | null;
};

const createMemoryCache = <T>(): MemoryCache<T> => {
  const entries = new Map<string, CacheHit<T>>();

  return {
    async read(key: string): Promise<CacheHit<T> | null> {
      return entries.get(key) ?? null;
    },
    async write(key: string, value: T, options: CacheWriteOptions): Promise<void> {
      const now = Date.now();
      entries.set(key, {
        value,
        stale: false,
        staleAt: now + options.staleMs,
        expiresAt: now + (options.hardMs ?? options.staleMs * 4),
        ...(options.meta ? { meta: options.meta } : {}),
      });
    },
    async remove(key: string): Promise<void> {
      entries.delete(key);
    },
    async clear(): Promise<void> {
      entries.clear();
    },
    peek(key: string): CacheHit<T> | null {
      return entries.get(key) ?? null;
    },
  };
};

const createResponse = (payload: unknown): Response => ({
  ok: true,
  status: 200,
  json: async () => payload,
  headers: new Headers(),
} as Response);

const createStore = (input: {
  primaryPayload: unknown;
  fallbackPayload: unknown;
}) => {
  const primaryCache = createMemoryCache<UpstreamMappingPayload>();
  const fallbackCache = createMemoryCache<UpstreamMappingPayload>();

  const fetchImpl: typeof fetch = async (url: string | URL | Request) => {
    const href = String(url);
    if (href.includes('PlexAniBridge-Mappings')) {
      return createResponse(input.primaryPayload);
    }
    if (href.includes('Kometa-Team/Anime-IDs')) {
      return createResponse(input.fallbackPayload);
    }
    throw new Error(`Unexpected fetch URL: ${href}`);
  };

  return {
    store: new UpstreamMappingStore(
      {
        primary: primaryCache,
        fallback: fallbackCache,
      },
      { fetch: fetchImpl },
    ),
    primaryCache,
    fallbackCache,
  };
};

describe('UpstreamMappingStore', () => {
  it('parses fallback object entries only from explicit AniList fields', async () => {
    const { store } = createStore({
      primaryPayload: {
        154_587: { tvdb_id: 424_536 },
        170_068: { tvdb_id: 424_536 },
        182_255: { tvdb_id: 424_536 },
      },
      fallbackPayload: {
        19_977: { tvdb_id: 424_536, tvdb_season: 3, tvdb_epoffset: 0 },
        17_617: { tvdb_id: 424_536, anilist_id: 154_587 },
        18_886: { tvdb_id: 424_536, anilist_id: 182_255 },
      },
    });

    await store.refreshAll();

    expect(store.get(19_977)).toBeNull();
    expect(store.get(170_068)).toEqual({ tvdbId: 424_536, source: 'primary' });
    expect(store.getAniListIdsForTvdb(424_536).toSorted((left, right) => left - right)).toEqual([
      154_587,
      170_068,
      182_255,
    ]);
    expect(store.listAllPairs().filter(entry => entry.tvdbId === 424_536)).toEqual([
      { anilistId: 154_587, tvdbId: 424_536, source: 'primary' },
      { anilistId: 170_068, tvdbId: 424_536, source: 'primary' },
      { anilistId: 182_255, tvdbId: 424_536, source: 'primary' },
    ]);
  });

  it('keeps explicit AniList IDs from fallback object entries', async () => {
    const { store, fallbackCache } = createStore({
      primaryPayload: {},
      fallbackPayload: {
        17_617: { tvdb_id: 424_536, anilist_id: 154_587 },
      },
    });

    await store.refresh('fallback');

    expect(store.get(154_587)).toEqual({ tvdbId: 424_536, source: 'fallback' });
    expect(store.getAniListIdsForTvdb(424_536)).toEqual([154_587]);
    expect(fallbackCache.peek('upstream')?.value.pairs).toEqual({ 154_587: 424_536 });
  });
});
