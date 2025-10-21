import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Query } from '@tanstack/query-core';
import { queryPersister, shouldPersistQuery } from '@/cache/query-cache';
import type { PersistedClient } from '@tanstack/query-persist-client-core';

const idb = vi.hoisted(() => ({
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}));

vi.mock('idb-keyval', () => idb);

const makeQuery = (queryKey: unknown, meta?: Record<string, unknown>): Query =>
  ({
    queryKey,
    meta,
    state: { status: 'success' },
  } as unknown as Query);

describe('queryPersister', () => {
  beforeEach(() => {
    idb.set.mockReset();
    idb.get.mockReset();
    idb.del.mockReset();
  });

  it('persists clients to IndexedDB via idb-keyval', async () => {
    const client: PersistedClient = {
      timestamp: Date.now(),
      buster: 'test',
      clientState: { mutations: [], queries: [] },
    };
    await queryPersister.persistClient(client);
    expect(idb.set).toHaveBeenCalledWith('kitsunarr:tanstack-query', client);
  });

  it('restores clients from IndexedDB', async () => {
    idb.get.mockResolvedValueOnce({ restored: true });
    await expect(queryPersister.restoreClient()).resolves.toEqual({ restored: true });
  });

  it('removes persisted clients from IndexedDB', async () => {
    await queryPersister.removeClient();
    expect(idb.del).toHaveBeenCalledWith('kitsunarr:tanstack-query');
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
