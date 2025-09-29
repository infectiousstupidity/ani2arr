// src/cache/ttl-cache.ts
import { createStore, del, get, keys, set } from 'idb-keyval';

export interface CacheEntry<T> {
  value: T;
  staleAt: number;
  expiresAt: number;
  meta?: Record<string, unknown>;
}

export interface CacheHit<T> {
  value: T;
  stale: boolean;
  staleAt: number;
  expiresAt: number;
  meta?: Record<string, unknown>;
}

export interface CacheWriteOptions {
  staleMs: number;
  hardMs?: number;
  meta?: Record<string, unknown>;
}

export interface TtlCache<T> {
  read(key: string): Promise<CacheHit<T> | null>;
  write(key: string, value: T, options: CacheWriteOptions): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

const STORE_NAME = 'kitsunarr-cache';
const STORE = createStore(STORE_NAME, 'entries');

type MemoryCache<T> = Map<string, CacheEntry<T>>;

const globalMemory = new Map<string, MemoryCache<unknown>>();

export function createTtlCache<T>(namespace: string): TtlCache<T> {
  const memory = (globalMemory.get(namespace) as MemoryCache<T> | undefined) ?? new Map<string, CacheEntry<T>>();
  globalMemory.set(namespace, memory as MemoryCache<unknown>);

  const keyFor = (key: string) => `${namespace}:${key}`;

  const read = async (key: string): Promise<CacheHit<T> | null> => {
    const id = keyFor(key);
    const now = Date.now();
    let entry = memory.get(id) ?? null;

    if (!entry) {
      entry = (await get<CacheEntry<T>>(id, STORE)) ?? null;
      if (!entry) return null;
      memory.set(id, entry);
    }

    if (now >= entry.expiresAt) {
      await del(id, STORE);
      memory.delete(id);
      return null;
    }

    return {
      value: entry.value,
      stale: now >= entry.staleAt,
      staleAt: entry.staleAt,
      expiresAt: entry.expiresAt,
      ...(entry.meta ? { meta: entry.meta } : {}),
    };
  };

  const write = async (key: string, value: T, options: CacheWriteOptions): Promise<void> => {
    const id = keyFor(key);
    const now = Date.now();
    const entry: CacheEntry<T> = {
      value,
      staleAt: now + options.staleMs,
      expiresAt: now + (options.hardMs ?? options.staleMs * 4),
      ...(options.meta ? { meta: options.meta } : {}),
    };
    memory.set(id, entry);
    await set(id, entry, STORE);
  };

  const remove = async (key: string): Promise<void> => {
    const id = keyFor(key);
    memory.delete(id);
    await del(id, STORE);
  };

  const clear = async (): Promise<void> => {
    const allKeys = await keys(STORE);
    const scoped = allKeys.filter((key): key is string => typeof key === 'string' && key.startsWith(`${namespace}:`));
    if (scoped.length === 0) return;
    scoped.forEach(id => memory.delete(id));
    await Promise.all(scoped.map(id => del(id, STORE)));
  };

  return {
    read,
    write,
    remove,
    clear,
  };
}
