// src/cache/index.ts
export type CacheEntry<T> = { value: T; staleAt: number; expiresAt: number };

export type CacheOpts = {
  namespace: string;
  softTtlMs: number;
  hardTtlMs: number;
  errorTtlMs?: number;
};

export interface CacheAdapter {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>;
  del(key: string): Promise<void>;
}

export interface Cache {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, value: T, now?: number): Promise<void>;
  setError(key: string, now?: number): Promise<void>;
  del(key: string): Promise<void>;
  isStale(entry: CacheEntry<unknown>, now: number): boolean;
  isExpired(entry: CacheEntry<unknown>, now: number): boolean;
}

export function createCache(adapter: CacheAdapter, opts: CacheOpts): Cache {
  const ns = (k: string) => `${opts.namespace}:${k}`;
  return {
    async get<T>(k) { return adapter.get<T>(ns(k)); },
    async set<T>(k, value, now = Date.now()) {
      const entry: CacheEntry<T> = {
        value,
        staleAt: now + opts.softTtlMs,
        expiresAt: now + opts.hardTtlMs,
      };
      await adapter.set(ns(k), entry);
    },
    async setError(k, now = Date.now()) {
      const ttl = opts.errorTtlMs ?? Math.min(opts.softTtlMs, 5 * 60_000);
      const entry: CacheEntry<{ __error: true }> = {
        value: { __error: true }, staleAt: now + ttl, expiresAt: now + ttl,
      };
      await adapter.set(ns(k), entry);
    },
    async del(k) { await adapter.del(ns(k)); },
    isStale(e, now) { return now >= e.staleAt && now < e.expiresAt; },
    isExpired(e, now) { return now >= e.expiresAt; },
  };
}
