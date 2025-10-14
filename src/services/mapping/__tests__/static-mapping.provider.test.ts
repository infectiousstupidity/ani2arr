import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TtlCache } from '@/cache';
import { StaticMappingProvider } from '@/services/mapping/static-mapping.provider';

type CacheHit<T> = {
  value: T;
  stale: boolean;
  staleAt: number;
  expiresAt: number;
  meta?: Record<string, unknown>;
};

function createCacheStub<T>() {
  return {
    read: vi.fn<() => Promise<CacheHit<T> | null>>(),
    write: vi.fn<() => Promise<void>>(),
    remove: vi.fn<() => Promise<void>>(),
    clear: vi.fn<() => Promise<void>>(),
  } as unknown as TtlCache<T> & {
    read: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
}

describe('StaticMappingProvider', () => {
  let primary: ReturnType<typeof createCacheStub<{ pairs: Record<number, number> }>>;
  let fallback: ReturnType<typeof createCacheStub<{ pairs: Record<number, number> }>>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let provider: StaticMappingProvider;

  beforeEach(() => {
    primary = createCacheStub<{ pairs: Record<number, number> }>();
    fallback = createCacheStub<{ pairs: Record<number, number> }>();
    fetchMock = vi.fn();
    provider = new StaticMappingProvider({ primary, fallback }, { fetch: fetchMock });
  });

  it('hydrate from cached values on init and triggers background refreshes', async () => {
    primary.read.mockResolvedValueOnce({
      value: { pairs: { 1: 1001 } },
      stale: false,
      staleAt: Date.now() + 1,
      expiresAt: Date.now() + 2,
    });
    fallback.read.mockResolvedValueOnce({
      value: { pairs: { 2: 2002 } },
      stale: false,
      staleAt: Date.now() + 1,
      expiresAt: Date.now() + 2,
    });

    fetchMock.mockResolvedValue(new Response(JSON.stringify({ pairs: {} }), { status: 200 }));

    await provider.init();
    expect(provider.get(1)).toEqual({ tvdbId: 1001, source: 'primary' });
    expect(provider.get(2)).toEqual({ tvdbId: 2002, source: 'fallback' });
    // background refresh fires for both sources
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refresh uses ETag and hydrates from cache on 304', async () => {
    primary.read.mockResolvedValueOnce({
      value: { pairs: { 10: 1010 } },
      stale: false,
      staleAt: Date.now() + 1,
      expiresAt: Date.now() + 2,
      meta: { etag: 'abc' },
    });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304, headers: { ETag: 'abc' } }));

    await provider.refresh('primary');
    expect(provider.get(10)).toEqual({ tvdbId: 1010, source: 'primary' });

    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit)?.headers as Record<string, string>;
    expect(headers['If-None-Match']).toBe('abc');
  });

  it('refresh throws normalized error when response not ok', async () => {
    primary.read.mockResolvedValueOnce(null);
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    await expect(provider.refresh('primary')).rejects.toBeTruthy();
  });

  it('buildPairsFromSource accepts array payload with variant keys', async () => {
    primary.read.mockResolvedValueOnce(null);
    const arrayPayload = [
      { anilist_id: '123', tvdb_id: '456' },
      { anilist: 789, tvdb: 111 },
      { aniId: '222', tvdbid: '333' },
    ];
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(arrayPayload), { status: 200, headers: { ETag: 'e1' } }),
    );

    await provider.refresh('primary');
    expect(provider.get(123)).toEqual({ tvdbId: 456, source: 'primary' });
    expect(provider.get(789)).toEqual({ tvdbId: 111, source: 'primary' });
    expect(provider.get(222)).toEqual({ tvdbId: 333, source: 'primary' });
  });

  it('buildPairsFromSource accepts object payload with flexible shapes', async () => {
    fallback.read.mockResolvedValueOnce(null);
    const objectPayload = {
      '1001': { anilist_id: 1001, tvdb_id: '9001' },
      '1002': 9002,
      'bad': { anilist_id: 'x', tvdb: 'y' }, // ignored
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(objectPayload), { status: 200, headers: { ETag: 'e2' } }),
    );

    await provider.refresh('fallback');
    expect(provider.get(1001)).toEqual({ tvdbId: 9001, source: 'fallback' });
    expect(provider.get(1002)).toEqual({ tvdbId: 9002, source: 'fallback' });
    expect(provider.get(42)).toBeNull();
  });

  it('reset clears in-memory maps and removes cache entries', async () => {
    primary.read.mockResolvedValueOnce({
      value: { pairs: { 5: 5005 } },
      stale: false,
      staleAt: Date.now() + 1,
      expiresAt: Date.now() + 2,
    });
    await provider.init();
    expect(provider.get(5)).not.toBeNull();

    await provider.reset();
    expect(provider.get(5)).toBeNull();
    expect(primary.remove).toHaveBeenCalledWith('static');
    expect(fallback.remove).toHaveBeenCalledWith('static');
  });
});