// src/cache/ttl-cache.ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

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

const DB_NAME = 'a2a-cache-db';
const STORE_NAME = 'ttl-cache-store';
const DB_VERSION = 1;

interface CacheDbSchema extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: CacheEntry<unknown>;
  };
}

let dbPromise: Promise<IDBPDatabase<CacheDbSchema>> | null = null;
const memoryFallback = new Map<string, CacheEntry<unknown>>();

const getDb = (): Promise<IDBPDatabase<CacheDbSchema>> => {
  if (!dbPromise) {
    dbPromise = openDB<CacheDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
};

export function createTtlCache<T>(namespace: string): TtlCache<T> {
  const keyFor = (key: string) => `${namespace}:${key}`;

  const read = async (key: string): Promise<CacheHit<T> | null> => {
    const now = Date.now();

    const memKey = keyFor(key);
    const memEntry = memoryFallback.get(memKey) as CacheEntry<T> | undefined;
    if (memEntry) {
      if (now >= memEntry.expiresAt) {
        memoryFallback.delete(memKey);
      } else {
        return {
          value: memEntry.value,
          stale: now >= memEntry.staleAt,
          staleAt: memEntry.staleAt,
          expiresAt: memEntry.expiresAt,
          ...(memEntry.meta ? { meta: memEntry.meta } : {}),
        };
      }
    }

    const db = await getDb();
    const entry = (await db.get(STORE_NAME, keyFor(key))) as CacheEntry<T> | undefined;
    if (!entry) return null;

    if (now >= entry.expiresAt) {
      await db.delete(STORE_NAME, keyFor(key));
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
    const now = Date.now();
    const entry: CacheEntry<T> = {
      value,
      staleAt: now + options.staleMs,
      expiresAt: now + (options.hardMs ?? options.staleMs * 4),
      ...(options.meta ? { meta: options.meta } : {}),
    };
    const memKey = keyFor(key);
    const db = await getDb();
    await db.put(STORE_NAME, entry, memKey);
    // Keep a shadow copy so reads still work if IDB evicts or is inaccessible.
    memoryFallback.set(memKey, entry as CacheEntry<unknown>);
  };

  const remove = async (key: string): Promise<void> => {
    memoryFallback.delete(keyFor(key));
    const db = await getDb();
    await db.delete(STORE_NAME, keyFor(key));
  };

  const clear = async (): Promise<void> => {
    // Clear namespace slice of the in-memory fallback
    for (const memKey of Array.from(memoryFallback.keys())) {
      if (memKey.startsWith(`${namespace}:`)) {
        memoryFallback.delete(memKey);
      }
    }
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const range = IDBKeyRange.bound(`${namespace}:`, `${namespace}:\uffff`);
    await store.delete(range);
    await tx.done;
  };

  return {
    read,
    write,
    remove,
    clear,
  };
}
