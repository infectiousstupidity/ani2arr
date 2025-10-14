import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TtlCache } from '@/cache';
import { SonarrLookupClient, type SonarrLookupCredentials } from '@/services/mapping/sonarr-lookup.client';
import type { SonarrLookupSeries } from '@/types';
import type { SonarrApiService } from '@/api/sonarr.api';
import type { Mock } from 'vitest';

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

const creds: SonarrLookupCredentials = { url: 'https://sonarr.local', apiKey: 'abc123' };

describe('SonarrLookupClient', () => {
  let api: { lookupSeriesByTerm: Mock<(term: string, creds: SonarrLookupCredentials) => Promise<SonarrLookupSeries[]>> };
  let positive: ReturnType<typeof createCacheStub<SonarrLookupSeries[]>>;
  let negative: ReturnType<typeof createCacheStub<boolean>>;
  let client: SonarrLookupClient;

  const series = (overrides: Partial<SonarrLookupSeries> = {}): SonarrLookupSeries => ({
    tvdbId: 100,
    title: 'Example',
    year: 2020,
    ...overrides,
  });

  beforeEach(() => {
    api = { lookupSeriesByTerm: vi.fn(async (_term: string, _creds: SonarrLookupCredentials) => [] as SonarrLookupSeries[]) };
    positive = createCacheStub<SonarrLookupSeries[]>();
    negative = createCacheStub<boolean>();
    client = new SonarrLookupClient(api as unknown as SonarrApiService, { positive, negative });
  });

  it('returns empty when sanitized term is empty', async () => {
    const res = await client.lookup('canon', '   /  ', creds);
    expect(res).toEqual([]);
    expect(api.lookupSeriesByTerm).not.toHaveBeenCalled();
  });

  it('returns fresh positive cache and skips network', async () => {
    positive.read.mockResolvedValueOnce({
      value: [series({ tvdbId: 1 })],
      stale: false,
      staleAt: Date.now() + 1,
      expiresAt: Date.now() + 2,
    });
    const res = await client.lookup('some-canon', 'Some Title', creds);
    expect(res).toEqual([{ tvdbId: 1, title: 'Example', year: 2020 }]);
    expect(api.lookupSeriesByTerm).not.toHaveBeenCalled();
  });

  it('returns fresh negative cache and skips network', async () => {
    negative.read.mockResolvedValueOnce({
      value: true,
      stale: false,
      staleAt: Date.now() + 1,
      expiresAt: Date.now() + 2,
    });
    const res = await client.lookup('some-canon', 'Some Title', creds);
    expect(res).toEqual([]);
    expect(api.lookupSeriesByTerm).not.toHaveBeenCalled();
  });

  it('reuses inflight lookup for same canonical key', async () => {
    api.lookupSeriesByTerm.mockImplementation(async () => {
      await Promise.resolve();
      return [series({ tvdbId: 2 })];
    });

    const p1 = client.lookup('canon-x', 'Title X', creds);
    const p2 = client.lookup('canon-x', 'Title X', creds);
    expect(p1).toBe(p2);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual([{ tvdbId: 2, title: 'Example', year: 2020 }]);
    expect(r2).toEqual([{ tvdbId: 2, title: 'Example', year: 2020 }]);
    expect(api.lookupSeriesByTerm).toHaveBeenCalledTimes(1);
  });

  it('writes positive cache on results and removes negative cache', async () => {
    api.lookupSeriesByTerm.mockResolvedValueOnce([series({ tvdbId: 3 })]);
    const res = await client.lookup('canon-y', 'Title Y', creds);
    expect(res.length).toBe(1);
    expect(positive.write).toHaveBeenCalledTimes(1);
    expect(negative.remove).toHaveBeenCalledTimes(1);
  });

  it('writes negative cache on empty results and removes positive cache', async () => {
    api.lookupSeriesByTerm.mockResolvedValueOnce([]);
    const res = await client.lookup('canon-z', 'Title Z', creds);
    expect(res).toEqual([]);
    expect(negative.write).toHaveBeenCalledTimes(1);
    expect(positive.remove).toHaveBeenCalledTimes(1);
  });

  it('forceNetwork bypasses caches but still reuses inflight if exists', async () => {
    positive.read.mockResolvedValueOnce({
      value: [series({ tvdbId: 10 })],
      stale: false,
      staleAt: Date.now() + 1,
      expiresAt: Date.now() + 2,
    });
    api.lookupSeriesByTerm.mockResolvedValue([series({ tvdbId: 11 })]);

    const p1 = client.lookup('cn-force', 'Term', creds, { forceNetwork: true });
    const p2 = client.lookup('cn-force', 'Term', creds, { forceNetwork: true });
    expect(p1).toBe(p2);

    const out = await p1;
    expect(out[0]!.tvdbId).toBe(11);
    expect(api.lookupSeriesByTerm).toHaveBeenCalledTimes(1);
  });

  it('readFromCache returns inflight when present', async () => {
    api.lookupSeriesByTerm.mockResolvedValueOnce([series({ tvdbId: 12 })]);
    const promise = client.lookup('cn-read', 'Term', creds, { forceNetwork: true });
    const cached = await client.readFromCache('cn-read');
    expect(cached).toBe(promise);
    await promise;
  });

  it('lookup falls back to raw term when canonical cannot be derived', async () => {
    api.lookupSeriesByTerm.mockResolvedValueOnce([series({ tvdbId: 13 })]);
    // Passing empty canonicalKey and a rawTerm that results in empty canonical forces rawTerm path
    const out = await client.lookup('', 'Fate/Zero & Friends', creds);
    expect(api.lookupSeriesByTerm).toHaveBeenCalledWith('Fate/Zero & Friends', creds);
    expect(out[0]!.tvdbId).toBe(13);
  });
});