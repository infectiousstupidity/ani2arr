// src/cache/query-cache.ts
import type { PersistedClient, Persister } from '@tanstack/query-persist-client-core';
import type { Query } from '@tanstack/query-core';
import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';

const DB_NAME = 'a2a-tanstack-query-db';
const STORE_NAME = 'tanstack-query-store';
const STORE_KEY = 'a2a:tanstack-query';

interface QueryCacheDbSchema extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: PersistedClient;
  };
}

let dbPromise: Promise<IDBPDatabase<QueryCacheDbSchema>> | null = null;
let knownDbExists = false;

const hasPersistedQuerySnapshot = (client: PersistedClient): boolean =>
  client.clientState.queries.length > 0 || client.clientState.mutations.length > 0;

const detectExistingDb = async (): Promise<boolean> => {
  const indexedDbWithDatabases = indexedDB as IDBFactory & {
    databases?: () => Promise<Array<{ name?: string }>>;
  };

  if (typeof indexedDbWithDatabases.databases !== 'function') {
    return dbPromise !== null || knownDbExists;
  }

  try {
    const databases = await indexedDbWithDatabases.databases();
    return databases.some(database => database.name === DB_NAME);
  } catch {
    return dbPromise !== null || knownDbExists;
  }
};

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

  knownDbExists = true;
  return dbPromise;
};

// Persister adapter for TanStack Query persistence API
// Default persister implementation using IndexedDB
const defaultPersister: Persister = {
  persistClient: async (client) => {
    if (!hasPersistedQuerySnapshot(client)) {
      await clearPersistedQueryCache();
      return;
    }

    const db = await getDb();
    await db.put(STORE_NAME, client, STORE_KEY);
  },
  restoreClient: async () => {
    if (!(await detectExistingDb())) {
      return undefined;
    }

    const db = await getDb();
    return db.get(STORE_NAME, STORE_KEY);
  },
  removeClient: async () => {
    await clearPersistedQueryCache();
  },
};

// Current active persister. Tests may replace this via the exported
// `overrideQueryPersisterForTests` helper. Production code should never
// need to change this.
let currentPersister: Persister = defaultPersister;

// Exported persister delegates to the current active persister. This keeps
// the exported object reference stable while allowing controlled overrides
// for tests without mutating imported module state.
export const queryPersister: Persister = {
  persistClient: (...args: Parameters<Persister['persistClient']>) => currentPersister.persistClient(...args),
  restoreClient: (...args: Parameters<Persister['restoreClient']>) => currentPersister.restoreClient(...args),
  removeClient: (...args: Parameters<Persister['removeClient']>) => currentPersister.removeClient(...args),
};

/**
 * Test-only: override the active persister used by `queryPersister`.
 * Passing `null` will restore the default IndexedDB persister.
 *
 * Note: exported for tests only. Avoid using this in production code.
 */
export function overrideQueryPersisterForTests(persister: Persister | null): void {
  currentPersister = persister ?? defaultPersister;
}

export async function clearPersistedQueryCache(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } finally {
      dbPromise = null;
    }
  }

  await deleteDB(DB_NAME, {
    blocked() {
      // Allow the delete to proceed even if a connection lingers.
    },
  });
  knownDbExists = false;
}

// Filter: never persist queries containing provider credentials or Arr metadata
const CREDENTIAL_QUERY_PREFIX = ['a2a', 'options'] as const;

/**
 * Determines which queries should be persisted to IndexedDB in the page context.
 * 
 * EXCLUDED (for security/privacy):
 * - 'options' queries: contain provider URLs + API keys
 * - Arr metadata queries: contain server filesystem paths, quality profile names, tag labels
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

  // Block Arr metadata (filesystem paths, quality profiles, tags)
  if (key[0] === 'a2a' && (key[1] === 'sonarrMetadata' || key[1] === 'radarrMetadata')) {
    return false;
  }

  // Block series status queries to avoid persisting rich Sonarr payloads
  if (key[0] === 'a2a' && key[1] === 'seriesStatus') {
    return false;
  }

  return true;
};
