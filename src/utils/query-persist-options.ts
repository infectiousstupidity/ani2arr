import type { Query, DehydrateOptions } from '@tanstack/query-core';
import type { PersistedClient } from '@tanstack/query-persist-client-core';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';
import { queryPersister, shouldPersistQuery } from '@/cache/query-cache';

type WarnLogger = Pick<Console, 'warn'>;

// Minimal local type to probe persisted client shape without using `any`.
// Minimal shapes to probe persisted client state safely (no `any`).
type PersistedQuerySnapshot = {
  queryKey?: unknown;
  state?: {
    status?: string;
    data?: unknown;
    error?: unknown;
  };
};

type PersistedClientStateProbe = { clientState?: { queries?: PersistedQuerySnapshot[]; mutations?: unknown[] } };

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
  // Dev-only structured clone diagnostics to identify offending queries
  const probeUncloneables = (client: PersistedClient, maxLogs = 5) => {
    if (!import.meta.env?.DEV) return;
    try {
      const queries = (client as unknown as PersistedClientStateProbe)?.clientState?.queries ?? [];
      let logged = 0;
      const mutations = (client as unknown as PersistedClientStateProbe)?.clientState?.mutations ?? [];
      logger.warn(
        `[persist:summary] queries=${queries.length} mutations=${mutations.length} byStatus=` +
          JSON.stringify(
            queries.reduce<Record<string, number>>((acc, q) => {
              const s = q?.state?.status ?? 'unknown';
              acc[s] = (acc[s] ?? 0) + 1;
              return acc;
            }, {}),
          ),
      );

      for (const q of queries) {
        if (logged >= maxLogs) break;
        const keyStr = (() => {
          try { return JSON.stringify(q?.queryKey ?? null); } catch { return String(q?.queryKey ?? ''); }
        })();
        const status = q?.state?.status ?? 'unknown';
        const test = (v: unknown) => {
          try { structuredClone(v); return true; } catch { return false; }
        };
        const stateOk = test(q?.state);
        const dataOk = test(q?.state?.data);
        const errorOk = test(q?.state?.error);
        if (!stateOk || !dataOk || !errorOk) {
          logged += 1;
          logger.warn(
            `[persist:probe] key=${keyStr} status=${status} cloneable.state=${String(stateOk)} cloneable.data=${String(dataOk)} cloneable.error=${String(errorOk)}`,
          );
        }
      }
    } catch {
      // swallow
    }
  };
  return {
    persister: {
      persistClient: async (client) => {
        try {
          await queryPersister.persistClient(client);
        } catch (error) {
          // Firefox may throw DataCloneError if any query data contains non-cloneable values.
          // Skip persistence in that case to avoid noisy console errors in browse contexts.
          const name = (error as { name?: string } | null | undefined)?.name || '';
          if (name === 'DataCloneError') {
            logger.warn('Skipping query cache persist due to DataCloneError');
            // Probe which query caused it to help root cause
            try { probeUncloneables(client as PersistedClient); } catch { /* empty */ }
            return;
          }
          throw error;
        }
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
