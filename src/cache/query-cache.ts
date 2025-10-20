import type { Persister } from '@tanstack/query-persist-client-core';
import type { Query } from '@tanstack/query-core';
import { del, get, set } from 'idb-keyval';

const STORE_KEY = 'kitsunarr:tanstack-query';

// Persister adapter for TanStack Query persistence API
export const queryPersister: Persister = {
  persistClient: async (client) => set(STORE_KEY, client),
  restoreClient: async () => get(STORE_KEY),
  removeClient: async () => del(STORE_KEY),
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
export const shouldPersistQuery = (query: Query): boolean => {
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
