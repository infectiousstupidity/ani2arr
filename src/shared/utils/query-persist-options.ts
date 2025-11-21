// src/shared/utils/query-persist-options.ts
import type { Query, DehydrateOptions } from '@tanstack/query-core';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';
import { queryPersister, shouldPersistQuery } from '@/cache/query-cache';

type WarnLogger = Pick<Console, 'warn'>;

const shouldDehydrateQuery: NonNullable<DehydrateOptions['shouldDehydrateQuery']> = (
  query: Query<unknown, Error, unknown, readonly unknown[]>,
) => {
  // Persist only successful queries to avoid cloning transient pending/error snapshots
  // which can contain non-cloneable values in some browsers.
  return (query.state?.status === 'success') && shouldPersistQuery(query);
};

export function createPersistOptions(
  logger: WarnLogger,
): PersistQueryClientProviderProps['persistOptions'] {
  return {
    persister: {
      persistClient: async (client) => {
        await queryPersister.persistClient(client);
      },
      removeClient: queryPersister.removeClient,
      restoreClient: async () => {
        try {
          return await queryPersister.restoreClient();
        } catch (error) {
          logger.warn('Failed to hydrate query cache', error);
          throw error;
        }
      },
    },
    maxAge: 24 * 60 * 60 * 1000, // 24h
    dehydrateOptions: {
      shouldDehydrateQuery,
      // Mutations are not needed to persist for our use cases; exclude proactively
      shouldDehydrateMutation: () => false,
    },
  };
}

export type PersistOptions = ReturnType<typeof createPersistOptions>;
