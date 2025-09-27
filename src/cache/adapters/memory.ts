// src/cache/adapters/memory.ts
import type { CacheAdapter, CacheEntry } from '../index';

export function memoryAdapter(max = 400): CacheAdapter {
  const map = new Map<string, CacheEntry<unknown>>();
  return {
    async get<T>(k) { return (map.get(k) as CacheEntry<T>) ?? null; },
    async set<T>(k, e) {
      if (map.size >= max) map.delete(map.keys().next().value as string);
      map.set(k, e);
    },
    async del(k) { map.delete(k); },
  };
}
