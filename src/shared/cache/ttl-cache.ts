/** Generic IndexedDB-backed TTL cache primitive used by domain cache wrappers. */
// src/shared/cache/ttl-cache.ts

import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import { logger } from "@/shared/utils/logger";

const TTL_CACHE_DB_NAME = "a2a-cache-db";
const TTL_CACHE_DB_VERSION = 1;
const TTL_CACHE_STORE_NAME = "ttl-cache-store";

const log = logger.create("TtlCache");

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

interface CacheDbSchema extends DBSchema {
	[TTL_CACHE_STORE_NAME]: {
		key: string;
		value: CacheEntry<unknown>;
	};
}

let dbPromise: Promise<IDBPDatabase<CacheDbSchema>> | null = null;

const openCacheDb = (): Promise<IDBPDatabase<CacheDbSchema>> =>
	openDB<CacheDbSchema>(TTL_CACHE_DB_NAME, TTL_CACHE_DB_VERSION, {
		upgrade(db) {
			if (!db.objectStoreNames.contains(TTL_CACHE_STORE_NAME)) {
				db.createObjectStore(TTL_CACHE_STORE_NAME);
			}
		},
	});

const recreateDb = async (): Promise<IDBPDatabase<CacheDbSchema>> => {
	await deleteDB(TTL_CACHE_DB_NAME);
	return openCacheDb();
};

const getDb = (): Promise<IDBPDatabase<CacheDbSchema>> => {
	if (!dbPromise) {
		dbPromise = openCacheDb()
			.then(async (db) => {
				if (db.objectStoreNames.contains(TTL_CACHE_STORE_NAME)) {
					return db;
				}

				log.warn("Object store missing after open; recreating database.");
				db.close();
				return recreateDb();
			})
			.catch(async (error) => {
				if (error instanceof DOMException && error.name === "VersionError") {
					log.warn("VersionError opening database; recreating.");
					return recreateDb();
				}

				throw error;
			});
	}
	return dbPromise;
};

export async function clearAllTtlCaches(): Promise<void> {
	if (dbPromise) {
		try {
			const db = await dbPromise;
			db.close();
		} finally {
			dbPromise = null;
		}
	}

	await deleteDB(TTL_CACHE_DB_NAME);
}

export function createTtlCache<T>(namespace: string): TtlCache<T> {
	const keyFor = (key: string) => `${namespace}:${key}`;

	const read = async (key: string): Promise<CacheHit<T> | null> => {
		const now = Date.now();
		const db = await getDb();
		const cacheKey = keyFor(key);
		const entry = (await db.get(TTL_CACHE_STORE_NAME, cacheKey)) as
			| CacheEntry<T>
			| undefined;
		if (!entry) return null;

		if (now >= entry.expiresAt) {
			await db.delete(TTL_CACHE_STORE_NAME, cacheKey);
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

	const write = async (
		key: string,
		value: T,
		options: CacheWriteOptions,
	): Promise<void> => {
		const now = Date.now();
		const entry: CacheEntry<T> = {
			value,
			staleAt: now + options.staleMs,
			expiresAt: now + (options.hardMs ?? options.staleMs * 4),
			...(options.meta ? { meta: options.meta } : {}),
		};
		const db = await getDb();
		await db.put(TTL_CACHE_STORE_NAME, entry, keyFor(key));
	};

	const remove = async (key: string): Promise<void> => {
		const db = await getDb();
		await db.delete(TTL_CACHE_STORE_NAME, keyFor(key));
	};

	const clear = async (): Promise<void> => {
		const db = await getDb();
		const tx = db.transaction(TTL_CACHE_STORE_NAME, "readwrite");
		const store = tx.objectStore(TTL_CACHE_STORE_NAME);
		const range = IDBKeyRange.bound(`${namespace}:`, `${namespace}:\uFFFF`);
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
