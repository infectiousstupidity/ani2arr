import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import type { PersistedClient } from '@tanstack/query-persist-client-core';
import type { Query } from '@tanstack/query-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const DB_NAME = 'kitsunarr-tanstack-query-db';
const STORE_NAME = 'tanstack-query-store';
const STORE_KEY = 'kitsunarr:tanstack-query';

const deleteDatabase = async (name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('delete blocked'));
  });

const makeQuery = (queryKey: unknown, meta?: Record<string, unknown>): Query =>
  ({
    queryKey,
    meta,
    state: { status: 'success' },
  } as unknown as Query);

describe('query-cache', () => {
  let queryPersister: typeof import('../query-cache').queryPersister;
  let shouldPersistQuery: typeof import('../query-cache').shouldPersistQuery;

  beforeEach(async () => {
    vi.resetModules();
    await deleteDatabase(DB_NAME).catch(() => {});
    ({ queryPersister, shouldPersistQuery } = await import('../query-cache'));
  });

  describe('queryPersister', () => {
    it('persists clients to IndexedDB via idb', async () => {
      const client: PersistedClient = {
        timestamp: Date.now(),
        buster: 'test',
        clientState: { mutations: [], queries: [] },
      };

      await queryPersister.persistClient(client);

      const db = await openDB(DB_NAME, 1);
      const stored = await db.get(STORE_NAME, STORE_KEY);
      expect(stored).toEqual(client);
      db.close();
    });

    it('restores clients from IndexedDB', async () => {
      const db = await openDB(DB_NAME, 1);
      const snapshot: PersistedClient = {
        timestamp: Date.now(),
        buster: 'restored',
        clientState: { mutations: [], queries: [] },
      };
      await db.put(STORE_NAME, snapshot, STORE_KEY);
      db.close();

      await expect(queryPersister.restoreClient()).resolves.toEqual(snapshot);
    });

    it('removes persisted clients from IndexedDB', async () => {
      const db = await openDB(DB_NAME, 1);
      await db.put(STORE_NAME, { value: true }, STORE_KEY);
      db.close();

      await queryPersister.removeClient();

      const verifyDb = await openDB(DB_NAME, 1);
      const stored = await verifyDb.get(STORE_NAME, STORE_KEY);
      expect(stored).toBeUndefined();
      verifyDb.close();
    });
  });

  describe('shouldPersistQuery', () => {
    it('skips persistence when meta.persist is false', () => {
      expect(shouldPersistQuery(makeQuery(['kitsunarr', 'status'], { persist: false }))).toBe(false);
    });

    it('skips persistence for options queries containing credentials', () => {
      expect(shouldPersistQuery(makeQuery(['kitsunarr', 'options', 'defaults']))).toBe(false);
    });

    it('skips persistence for sonarrMetadata queries containing filesystem paths and config', () => {
      expect(shouldPersistQuery(makeQuery(['kitsunarr', 'sonarrMetadata', 'configured']))).toBe(false);
      expect(shouldPersistQuery(makeQuery(['kitsunarr', 'sonarrMetadata', 'http://localhost|key123']))).toBe(false);
    });

    it('allows persistence for seriesStatus queries (safe: only titles, IDs, slugs)', () => {
      expect(shouldPersistQuery(makeQuery(['kitsunarr', 'seriesStatus', 123]))).toBe(true);
      expect(shouldPersistQuery(makeQuery(['kitsunarr', 'seriesStatus', 456, 'attack on titan']))).toBe(true);
    });

    it('allows persistence for unrelated kitsunarr queries', () => {
      expect(shouldPersistQuery(makeQuery(['kitsunarr', 'series', 123]))).toBe(true);
    });

    it('allows persistence when query key is not a tuple', () => {
      expect(shouldPersistQuery(makeQuery('plain-key'))).toBe(true);
      expect(shouldPersistQuery(makeQuery(['kitsunarr']))).toBe(true);
    });
  });
});
