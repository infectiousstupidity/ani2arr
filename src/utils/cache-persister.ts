// src/utils/cache-persister.ts

/**
 * @file Defines a storage persister specifically for the TanStack Query client.
 * This file acts as an **Adapter** between the `persistQueryClient` function
 * and a simple key-value storage library (`idb-keyval`).
 *
 * It is separate from the main application `CacheService` because its purpose is
 * different: it stores one large, opaque "client" object, whereas `CacheService`
 * is designed for caching many individual, TTL-managed data entries.
 */
import { Persister } from '@tanstack/query-persist-client-core';
import { del, get, set } from 'idb-keyval';

/**
 * An adapter that satisfies the `Persister` interface required by TanStack Query.
 *
 * It uses `idb-keyval`, a lightweight wrapper around IndexedDB, which is ideal
 * for storing large data blobs like the query client state.
 */
export const idbQueryCachePersister: Persister = {
  persistClient: async client => {
    await set('kitsunarr-query-client-cache', client);
  },
  restoreClient: async () => {
    return await get('kitsunarr-query-client-cache');
  },
  removeClient: async () => {
    await del('kitsunarr-query-client-cache');
  },
};