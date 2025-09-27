// src/cache/adapters/idb.ts
import { get, set, del } from 'idb-keyval';
import type { CacheAdapter, CacheEntry } from '../index';

export function idbAdapter(bucket: string): CacheAdapter {
  const key = (k: string) => `${bucket}:${k}`;
  return {
    async get<T>(k) { return (await get(key(k))) as CacheEntry<T> | null; },
    async set<T>(k, entry) { await set(key(k), entry); },
    async del(k) { await del(key(k)); },
  };
}
