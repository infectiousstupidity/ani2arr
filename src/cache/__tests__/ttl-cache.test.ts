import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Mock = ReturnType<typeof vi.fn>;

vi.mock('idb-keyval', () => {
  const storeBuckets = new Map<string, Map<unknown, unknown>>();
  let storeHandles = new Map<object, string>();

  const ensureStore = (store: object | undefined) => {
    if (!store) throw new Error('store handle missing');
    const key = storeHandles.get(store);
    if (!key) throw new Error('unknown store handle');
    let bucket = storeBuckets.get(key);
    if (!bucket) {
      bucket = new Map();
      storeBuckets.set(key, bucket);
    }
    return bucket;
  };

  const createStore = vi.fn((dbName: string, storeName: string) => {
    const key = `${dbName}:${storeName}`;
    if (!storeBuckets.has(key)) {
      storeBuckets.set(key, new Map());
    }
    const handle = { key };
    storeHandles.set(handle, key);
    return handle;
  });

  const get = vi.fn(async (key: string, store?: object) => ensureStore(store).get(key));

  const set = vi.fn(async (key: string, value: unknown, store?: object) => {
    ensureStore(store).set(key, value);
  });

  const del = vi.fn(async (key: string, store?: object) => {
    ensureStore(store).delete(key);
  });

  const keys = vi.fn(async (store?: object) => Array.from(ensureStore(store).keys()));

  const __reset = () => {
    storeBuckets.clear();
    storeHandles = new Map();
  };

  return { createStore, get, set, del, keys, __reset };
});

describe('createTtlCache', () => {
  let createTtlCache: typeof import('../ttl-cache').createTtlCache;

  beforeEach(async () => {
    vi.resetModules();
    const idb = await import('idb-keyval');
    (idb as unknown as { __reset: () => void }).__reset();
    ({ createTtlCache } = await import('../ttl-cache'));
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns stale entries while flagging them for refresh', async () => {
    const cache = createTtlCache<string>('stale');
    await cache.write('anime', 'naruto', { staleMs: 1_000 });

    vi.setSystemTime(1_500);

    const hit = await cache.read('anime');

    expect(hit).not.toBeNull();
    expect(hit?.value).toBe('naruto');
    expect(hit?.stale).toBe(true);
    expect(hit?.staleAt).toBe(1_000);
    expect(hit?.expiresAt).toBe(4_000);

    const { del } = await import('idb-keyval');
    const delMock = del as unknown as Mock;
    expect(delMock.mock.calls.length).toBe(0);
  });

  it('deletes expired entries from storage and memory', async () => {
    const cache = createTtlCache<string>('expire');
    await cache.write('hero', 'midoriya', { staleMs: 1_000 });

    vi.setSystemTime(5_000);

    const result = await cache.read('hero');
    expect(result).toBeNull();

    const { del } = await import('idb-keyval');
    const delMock = del as unknown as Mock;
    expect(delMock.mock.calls).toHaveLength(1);
    expect(delMock.mock.calls[0][0]).toBe('expire:hero');

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
