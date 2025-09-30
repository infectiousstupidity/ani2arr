import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

type Listener<Args extends unknown[]> = (...args: Args) => unknown | Promise<unknown>;

type EventMock<Args extends unknown[]> = {
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  emit: (...args: Args) => Promise<void>;
  reset: () => void;
};

const { runtimeOnMessage, storageOnChanged, storageLocalGet } = vi.hoisted(() => {
  function createMockEvent<Args extends unknown[]>(): EventMock<Args> {
    const listeners = new Set<Listener<Args>>();

    return {
      addListener: vi.fn((listener: Listener<Args>) => {
        listeners.add(listener);
      }),
      removeListener: vi.fn((listener: Listener<Args>) => {
        listeners.delete(listener);
      }),
      emit: async (...args: Args) => {
        await Promise.all([...listeners].map(listener => listener(...args)));
      },
      reset: () => {
        listeners.clear();
      },
    };
  }

  return {
    runtimeOnMessage: createMockEvent<[unknown]>(),
    storageOnChanged: createMockEvent<[
      Record<string, { oldValue?: unknown; newValue?: unknown }>,
      string,
    ]>(),
    storageLocalGet: vi.fn(),
  };
});

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      onMessage: runtimeOnMessage,
    },
    storage: {
      onChanged: storageOnChanged,
      local: {
        get: storageLocalGet,
      },
    },
  },
}));

import { useKitsunarrBroadcasts } from '../use-broadcasts';

const SERIES_KEY = ['kitsunarr', 'seriesStatus'] as const;
const LIBRARY_SESSION_KEY = 'kitsunarr_library_epoch';
const SETTINGS_SESSION_KEY = 'kitsunarr_settings_epoch';

describe('useKitsunarrBroadcasts', () => {
  const createWrapper = (queryClient: QueryClient) => {
    const Wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return Wrapper;
  };

  let queryClient: QueryClient;

  beforeEach(() => {
    sessionStorage.clear();
    runtimeOnMessage.reset();
    storageOnChanged.reset();
    storageLocalGet.mockReset();
    storageLocalGet.mockResolvedValue({ libraryEpoch: 0, settingsEpoch: 0 });
    queryClient = new QueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('responds to Kitsunarr runtime broadcasts', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const clearSpy = vi.spyOn(queryClient, 'clear');

    renderHook(() => useKitsunarrBroadcasts(), { wrapper: createWrapper(queryClient) });

    await act(async () => {
      await runtimeOnMessage.emit({
        _kitsunarr: true,
        topic: 'series-updated',
        payload: { epoch: 5 },
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: SERIES_KEY });
    expect(clearSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(LIBRARY_SESSION_KEY)).toBe('5');

    await act(async () => {
      await runtimeOnMessage.emit({
        _kitsunarr: true,
        topic: 'settings-changed',
        payload: { epoch: 9 },
      });
    });

    expect(clearSpy).toHaveBeenCalled();
    expect(sessionStorage.getItem(SETTINGS_SESSION_KEY)).toBe('9');
  });

  it('ignores non-Kitsunarr runtime broadcasts', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const clearSpy = vi.spyOn(queryClient, 'clear');

    renderHook(() => useKitsunarrBroadcasts(), { wrapper: createWrapper(queryClient) });

    await act(async () => {
      await runtimeOnMessage.emit({ topic: 'series-updated' });
      await runtimeOnMessage.emit({ _kitsunarr: false, topic: 'settings-changed' });
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(LIBRARY_SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem(SETTINGS_SESSION_KEY)).toBeNull();
  });

  it('responds to local storage epoch changes', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const clearSpy = vi.spyOn(queryClient, 'clear');

    renderHook(() => useKitsunarrBroadcasts(), { wrapper: createWrapper(queryClient) });

    await act(async () => {
      await storageOnChanged.emit(
        {
          libraryEpoch: { oldValue: 1, newValue: 3 },
        },
        'local',
      );
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: SERIES_KEY });
    expect(sessionStorage.getItem(LIBRARY_SESSION_KEY)).toBe('3');

    await act(async () => {
      await storageOnChanged.emit(
        {
          settingsEpoch: { oldValue: 2, newValue: 4 },
        },
        'local',
      );
    });

    expect(clearSpy).toHaveBeenCalled();
    expect(sessionStorage.getItem(SETTINGS_SESSION_KEY)).toBe('4');
  });

  it('reconciles persisted epochs on mount', async () => {
    sessionStorage.setItem(LIBRARY_SESSION_KEY, '4');
    sessionStorage.setItem(SETTINGS_SESSION_KEY, '7');

    storageLocalGet.mockResolvedValue({ libraryEpoch: 6, settingsEpoch: 8 });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const clearSpy = vi.spyOn(queryClient, 'clear');

    renderHook(() => useKitsunarrBroadcasts(), { wrapper: createWrapper(queryClient) });

    await act(async () => {
      await Promise.resolve();
    });

    expect(storageLocalGet).toHaveBeenCalledWith({ libraryEpoch: 0, settingsEpoch: 0 });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: SERIES_KEY });
    expect(clearSpy).toHaveBeenCalled();
    expect(sessionStorage.getItem(LIBRARY_SESSION_KEY)).toBe('6');
    expect(sessionStorage.getItem(SETTINGS_SESSION_KEY)).toBe('8');
  });
});
