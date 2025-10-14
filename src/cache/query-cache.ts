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

// Filter: never persist queries containing Sonarr credentials
const CREDENTIAL_QUERY_PREFIX = ['kitsunarr', 'options'] as const;

export const shouldPersistQuery = (query: Query): boolean => {
  if (query.meta?.persist === false) return false;
  const key = query.queryKey;
  if (!Array.isArray(key) || key.length < 2) return true;
  return key[0] !== CREDENTIAL_QUERY_PREFIX[0] || key[1] !== CREDENTIAL_QUERY_PREFIX[1];
};
