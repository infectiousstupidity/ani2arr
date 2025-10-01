import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedClient } from '@tanstack/query-persist-client-core';
import type { ExtensionOptions } from '@/types';

type MockFn = ReturnType<typeof vi.fn>;

const PERSIST_KEY = 'kitsunarr-query-client-cache';

vi.mock('idb-keyval', () => {
  let storedValue: unknown;

  const set = vi.fn(async (_key: string, value: unknown) => {
    storedValue = value;
  });

  const get = vi.fn(async (_key: string) => storedValue);

  const del = vi.fn(async (_key: string) => {
    storedValue = undefined;
  });

  return {
    set,
    get,
    del,
    __setStoredValue: (value: unknown) => {
      storedValue = value;
    },
    __getStoredValue: () => storedValue,
  };
});

describe('idbQueryCachePersister', () => {
  let persister: typeof import('../cache-persister').idbQueryCachePersister;
  let idb: Awaited<typeof import('idb-keyval')>;

  const createPersistedClient = (overrides?: Partial<PersistedClient>): PersistedClient => ({
    timestamp: Date.now(),
    buster: 'test-buster',
    clientState: { mutations: [], queries: [] },
    ...overrides,
  });

  beforeEach(async () => {
    vi.resetModules();
    idb = await import('idb-keyval');
    ({ idbQueryCachePersister: persister } = await import('../cache-persister'));
    vi.clearAllMocks();
    (idb as unknown as { __setStoredValue(value: unknown): void }).__setStoredValue(undefined);
  });

  it('persists client state using idb-keyval', async () => {
    const persistedClient = createPersistedClient({ timestamp: 123 });

    await persister.persistClient(persistedClient);

    const setMock = idb.set as unknown as MockFn;
    expect(setMock).toHaveBeenCalledWith(PERSIST_KEY, persistedClient);
  });

  it('restores client state using idb-keyval', async () => {
    const storedState = createPersistedClient({ timestamp: 456 });
    (idb as unknown as { __setStoredValue(value: unknown): void }).__setStoredValue(storedState);

    const result = await persister.restoreClient();

    const getMock = idb.get as unknown as MockFn;
    expect(getMock).toHaveBeenCalledWith(PERSIST_KEY);
    expect(result).toBe(storedState);
  });

  it('removes client state using idb-keyval', async () => {
    (idb as unknown as { __setStoredValue(value: unknown): void }).__setStoredValue({ foo: 'bar' });

    await persister.removeClient();

    const delMock = idb.del as unknown as MockFn;
    expect(delMock).toHaveBeenCalledWith(PERSIST_KEY);
    expect((idb as unknown as { __getStoredValue(): unknown }).__getStoredValue()).toBeUndefined();
  });

  it('propagates errors when persisting fails', async () => {
    const setMock = idb.set as unknown as MockFn;
    setMock.mockRejectedValueOnce(new Error('set failed'));

    const client = createPersistedClient();
    await expect(persister.persistClient(client)).rejects.toThrow('set failed');
    expect(setMock).toHaveBeenCalledWith(PERSIST_KEY, client);
  });

  it('propagates errors when restore fails', async () => {
    const getMock = idb.get as unknown as MockFn;
    getMock.mockRejectedValueOnce(new Error('get failed'));

    await expect(persister.restoreClient()).rejects.toThrow('get failed');
    expect(getMock).toHaveBeenCalledWith(PERSIST_KEY);
  });

  it('propagates errors when removal fails', async () => {
    const delMock = idb.del as unknown as MockFn;
    delMock.mockRejectedValueOnce(new Error('del failed'));

    await expect(persister.removeClient()).rejects.toThrow('del failed');
    expect(delMock).toHaveBeenCalledWith(PERSIST_KEY);
  });

  it('does not mutate extensionOptions fallback when persisting state', async () => {
    const fallback: ExtensionOptions = {
      sonarrUrl: '',
      sonarrApiKey: '',
      defaults: {
        qualityProfileId: '',
        rootFolderPath: '',
        seriesType: 'anime',
        monitorOption: 'all',
        seasonFolder: true,
        searchForMissingEpisodes: true,
        tags: [],
      },
    };
    const fallbackSnapshot = JSON.parse(JSON.stringify(fallback)) as ExtensionOptions;
    type ExtendedPersistedClient = PersistedClient & {
      dehydrated: { extensionOptions: ExtensionOptions };
    };

    const state = {
      ...createPersistedClient(),
      dehydrated: { extensionOptions: fallback },
    } as ExtendedPersistedClient;

    await persister.persistClient(state);

    const setMock = idb.set as unknown as MockFn;
    expect(setMock).toHaveBeenCalledWith(PERSIST_KEY, state);
    const [, savedState] = setMock.mock.calls[0]!;
    const typedSavedState = savedState as ExtendedPersistedClient;
    expect(typedSavedState).toBe(state);
    expect(typedSavedState.dehydrated.extensionOptions).toBe(fallback);
    expect(fallback).toEqual(fallbackSnapshot);
  });

  it('returns extensionOptions fallback without double wrapping on restore', async () => {
    const fallback: ExtensionOptions = {
      sonarrUrl: '',
      sonarrApiKey: '',
      defaults: {
        qualityProfileId: '',
        rootFolderPath: '',
        seriesType: 'anime',
        monitorOption: 'all',
        seasonFolder: true,
        searchForMissingEpisodes: true,
        tags: [],
      },
    };
    const fallbackSnapshot = JSON.parse(JSON.stringify(fallback)) as ExtensionOptions;
    type ExtendedPersistedClient = PersistedClient & {
      dehydrated: { extensionOptions: ExtensionOptions };
    };

    const storedState = {
      ...createPersistedClient(),
      dehydrated: { extensionOptions: fallback },
    } as ExtendedPersistedClient;
    (idb as unknown as { __setStoredValue(value: unknown): void }).__setStoredValue(storedState);

    const result = (await persister.restoreClient()) as ExtendedPersistedClient | undefined;

    expect(result?.dehydrated.extensionOptions).toBe(fallback);
    expect(fallback).toEqual(fallbackSnapshot);
  });
});
