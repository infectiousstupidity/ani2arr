import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DB_NAME = 'kitsunarr-cache-db';
const STORE_NAME = 'ttl-cache-store';

const deleteDatabase = async (name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('delete blocked'));
  });

describe('createTtlCache', () => {
  let createTtlCache: typeof import('../ttl-cache').createTtlCache;
  let now = 0;
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    await deleteDatabase(DB_NAME).catch(() => {});
    ({ createTtlCache } = await import('../ttl-cache'));
    now = 0;
    nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('returns stale entries while flagging them for refresh', async () => {
    const cache = createTtlCache<string>('stale');
    await cache.write('anime', 'naruto', { staleMs: 1_000 });

    now = 1_500;

    const hit = await cache.read('anime');

    expect(hit).not.toBeNull();
    expect(hit?.value).toBe('naruto');
    expect(hit?.stale).toBe(true);
    expect(hit?.staleAt).toBe(1_000);
    expect(hit?.expiresAt).toBe(4_000);
  });

  it('deletes expired entries from storage', async () => {
    const cache = createTtlCache<string>('expire');
    await cache.write('hero', 'midoriya', { staleMs: 1_000 });

    now = 5_000;

    const result = await cache.read('hero');
    expect(result).toBeNull();

    const db = await openDB(DB_NAME, 1);
    const storedEntry = await db.get(STORE_NAME, 'expire:hero');
    expect(storedEntry).toBeUndefined();
    db.close();

    const secondRead = await cache.read('hero');
    expect(secondRead).toBeNull();
  });

  it('persists and returns metadata alongside cache hits', async () => {
    const cache = createTtlCache<{ title: string }>('meta');
    await cache.write(
      'series',
      { title: 'Vinland Saga' },
      { staleMs: 2_000, meta: { etag: 'abc123', source: 'sonarr' } },
    );

    const hit = await cache.read('series');

    expect(hit).not.toBeNull();
    expect(hit?.meta).toEqual({ etag: 'abc123', source: 'sonarr' });
    expect(hit?.stale).toBe(false);
    expect(hit?.staleAt).toBe(2_000);
  });

  it('scopes clear() to the cache namespace', async () => {
    const cacheA = createTtlCache<string>('ns-a');
    const cacheB = createTtlCache<string>('ns-b');

    await cacheA.write('key', 'value-a', { staleMs: 1_000 });
    await cacheB.write('key', 'value-b', { staleMs: 1_000 });

    await cacheA.clear();

    const aHit = await cacheA.read('key');
    expect(aHit).toBeNull();

    const bHit = await cacheB.read('key');
    expect(bHit).not.toBeNull();
    expect(bHit?.value).toBe('value-b');
  });
});
