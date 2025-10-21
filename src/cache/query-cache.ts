// src/cache/query-cache.ts
import type { PersistedClient, Persister } from '@tanstack/query-persist-client-core';
import type { Query } from '@tanstack/query-core';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

const DB_NAME = 'kitsunarr-tanstack-query-db';
const STORE_NAME = 'tanstack-query-store';
const STORE_KEY = 'kitsunarr:tanstack-query';

interface QueryCacheDbSchema extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: PersistedClient;
  };
}

let dbPromise: Promise<IDBPDatabase<QueryCacheDbSchema>> | null = null;
const getDb = (): Promise<IDBPDatabase<QueryCacheDbSchema>> => {
  if (!dbPromise) {
    dbPromise = openDB<QueryCacheDbSchema>(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
};

// Persister adapter for TanStack Query persistence API
export const queryPersister: Persister = {
  persistClient: async (client) => {
    const db = await getDb();
    await db.put(STORE_NAME, client, STORE_KEY);
  },
  restoreClient: async () => {
    const db = await getDb();
    return db.get(STORE_NAME, STORE_KEY);
  },
  removeClient: async () => {
    const db = await getDb();
    await db.delete(STORE_NAME, STORE_KEY);
  },
};

// Filter: never persist queries containing Sonarr credentials or metadata
const CREDENTIAL_QUERY_PREFIX = ['kitsunarr', 'options'] as const;
const METADATA_QUERY_PREFIX = ['kitsunarr', 'sonarrMetadata'] as const;

/**
 * Determines which queries should be persisted to IndexedDB in the page context.
 * 
 * EXCLUDED (for security/privacy):
 * - 'options' queries: contain Sonarr URL + API key
 * - 'sonarrMetadata' queries: contain server filesystem paths, quality profile names, tag labels
 * 
 * INCLUDED (safe to persist):
 * - 'seriesStatus' queries: contain only titles, IDs, slugs (no sensitive data)
 * - AniList metadata: already public GraphQL data
 */
export const shouldPersistQuery = (
  query: Query<unknown, Error, unknown, readonly unknown[]>,
): boolean => {
  if (query.meta?.persist === false) return false;
  const key = query.queryKey;
  if (!Array.isArray(key) || key.length < 2) return true;
  
  // Block credentials (Sonarr URL + API key)
  if (key[0] === CREDENTIAL_QUERY_PREFIX[0] && key[1] === CREDENTIAL_QUERY_PREFIX[1]) {
    return false;
  }
  
  // Block Sonarr metadata (filesystem paths, quality profiles, tags)
  if (key[0] === METADATA_QUERY_PREFIX[0] && key[1] === METADATA_QUERY_PREFIX[1]) {
    return false;
  }
  
  return true;
};
