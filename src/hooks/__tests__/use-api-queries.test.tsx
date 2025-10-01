import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExtensionOptions, ExtensionError } from '@/types';

const normalizeErrorMock = vi.hoisted(() => vi.fn<(error: unknown) => ExtensionError>());

vi.mock('@/utils/error-handling', () => ({
  normalizeError: normalizeErrorMock,
}));

const getKitsunarrApiMock = vi.hoisted(() => vi.fn());

vi.mock('@/services', () => ({
  getKitsunarrApi: getKitsunarrApiMock,
}));

const extensionOptionsMock = vi.hoisted(() => ({
  getValue: vi.fn<() => Promise<ExtensionOptions>>(),
  setValue: vi.fn<(value: ExtensionOptions) => Promise<void>>(),
  watch: vi.fn<(callback: (value: ExtensionOptions) => void) => () => void>(),
}));

vi.mock('@/utils/storage', () => ({
  extensionOptions: extensionOptionsMock,
}));

import { queryKeys, useSeriesStatus, useAddSeries, useTestConnection, useSaveOptions, useExtensionOptions } from '../use-api-queries';

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const createWrapper = (client: QueryClient) => {
  const QueryClientProviderWrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  QueryClientProviderWrapper.displayName = 'QueryClientProviderWrapper';
  return QueryClientProviderWrapper;
};

const createOptions = (overrides?: Partial<ExtensionOptions>): ExtensionOptions => ({
  sonarrUrl: 'http://localhost:8989',
  sonarrApiKey: 'secret',
  defaults: {
    qualityProfileId: 1,
    rootFolderPath: '/anime',
    seriesType: 'anime',
    monitorOption: 'all',
    seasonFolder: true,
    searchForMissingEpisodes: true,
    tags: [],
  },
  ...overrides,
});

const createMockApi = () => ({
  getSeriesStatus: vi.fn<() => Promise<unknown>>(),
  addToSonarr: vi.fn<() => Promise<unknown>>(),
  notifySettingsChanged: vi.fn<() => Promise<unknown>>(),
  testConnection: vi.fn<() => Promise<unknown>>(),
  getSonarrMetadata: vi.fn<() => Promise<unknown>>(),
});

type MockApi = ReturnType<typeof createMockApi>;

const createNormalizedError = (overrides?: Partial<ExtensionError>): ExtensionError => ({
  code: 'UNKNOWN_ERROR' as ExtensionError['code'],
  message: 'normalized',
  userMessage: 'Normalized',
  timestamp: 1,
  ...overrides,
});

let mockApi: MockApi;

beforeEach(() => {
  mockApi = createMockApi();
  getKitsunarrApiMock.mockReturnValue(mockApi);
  extensionOptionsMock.getValue.mockReset();
  extensionOptionsMock.setValue.mockReset();
  extensionOptionsMock.watch.mockReset();
  normalizeErrorMock.mockReset();
});

describe('useSeriesStatus', () => {
  it('registers the correct query key and respects the enabled flag', async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    mockApi.getSeriesStatus.mockResolvedValue({ exists: false, tvdbId: null });

    const payload = { anilistId: 42, title: 'Test Title' };
    const { result } = renderHook(
      () => useSeriesStatus(payload, { enabled: false }),
      { wrapper },
    );

    await waitFor(() => {
      const state = queryClient.getQueryState(queryKeys.seriesStatus(payload));
      expect(state).toBeDefined();
    });
    expect(result.current.fetchStatus).toBe('idle');
    await waitFor(() => expect(mockApi.getSeriesStatus).not.toHaveBeenCalled());

    queryClient.clear();
  });

  it('evaluates ignoreFailureCache functions when building the status request', async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const payload = { anilistId: 7, title: '  Pending Title  ' };
    const ignoreFailureCache = vi.fn(() => true);

    mockApi.getSeriesStatus.mockResolvedValue({ exists: false, tvdbId: null });

    renderHook(
      () => useSeriesStatus(payload, { ignoreFailureCache }),
      { wrapper },
    );

    await waitFor(() => expect(mockApi.getSeriesStatus).toHaveBeenCalledTimes(1));

    expect(ignoreFailureCache).toHaveBeenCalledTimes(1);
    expect(mockApi.getSeriesStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        anilistId: payload.anilistId,
        title: payload.title,
        ignoreFailureCache: true,
      }),
    );

    queryClient.clear();
  });
});

describe('mutations', () => {
  const baseForm = {
    qualityProfileId: 1,
    rootFolderPath: '/anime',
    seriesType: 'anime' as const,
    monitorOption: 'all' as const,
    seasonFolder: true,
    searchForMissingEpisodes: true,
    tags: [] as number[],
  };

  it('calls addToSonarr and invalidates cached status queries on success', async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const addPayload = { anilistId: 10, title: 'Add Me', form: baseForm };
    const statusKey = queryKeys.seriesStatus({ anilistId: addPayload.anilistId, title: addPayload.title });

    queryClient.setQueryData(statusKey, { exists: false, tvdbId: null });

    mockApi.addToSonarr.mockResolvedValue({ id: 1 });

    const { result } = renderHook(() => useAddSeries(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(addPayload);
    });

    expect(mockApi.addToSonarr).toHaveBeenCalledWith(addPayload);

    await waitFor(() => {
      const state = queryClient.getQueryState(statusKey);
      expect(state?.isInvalidated).toBe(true);
    });

    queryClient.clear();
  });

  it('normalizes errors from addToSonarr before rejecting', async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const addPayload = { anilistId: 11, title: 'Fail', form: baseForm };
    const rawError = new Error('nope');
    const normalized = createNormalizedError({ message: 'normalized nope' });

    mockApi.addToSonarr.mockRejectedValue(rawError);
    normalizeErrorMock.mockReturnValueOnce(normalized);

    const { result } = renderHook(() => useAddSeries(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(addPayload)).rejects.toBe(normalized);
    });

    expect(normalizeErrorMock).toHaveBeenCalledWith(rawError);

    queryClient.clear();
  });

  it('calls testConnection and returns errors after normalization', async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const payload = { url: 'http://sonarr', apiKey: 'api' };
    const rawError = new Error('test failed');
    const normalized = createNormalizedError({ message: 'normalized test failed' });

    mockApi.testConnection.mockRejectedValue(rawError);
    normalizeErrorMock.mockReturnValueOnce(normalized);

    const { result } = renderHook(() => useTestConnection(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(payload)).rejects.toBe(normalized);
    });

    expect(mockApi.testConnection).toHaveBeenCalledWith(payload);
    expect(normalizeErrorMock).toHaveBeenCalledWith(rawError);

    queryClient.clear();
  });

  it('persists and invalidates options when save succeeds', async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const initialOptions = createOptions();
    const nextOptions = createOptions({ sonarrUrl: 'http://updated' });
  const unsubscribe = vi.fn<() => void>();

    queryClient.setQueryData(queryKeys.options(), initialOptions);

    extensionOptionsMock.setValue.mockResolvedValue();
    extensionOptionsMock.watch.mockReturnValue(unsubscribe);
    extensionOptionsMock.getValue.mockResolvedValue(initialOptions);
    mockApi.notifySettingsChanged.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useSaveOptions(), { wrapper });

    await act(async () => {
      const mutation = result.current.mutateAsync(nextOptions);
      await waitFor(() => {
        expect(queryClient.getQueryData(queryKeys.options())).toEqual(nextOptions);
      });
      await mutation;
    });

    expect(extensionOptionsMock.setValue).toHaveBeenCalledWith(nextOptions);
    expect(mockApi.notifySettingsChanged).toHaveBeenCalled();

    const state = queryClient.getQueryState(queryKeys.options());
    expect(state?.isInvalidated).toBe(true);

    queryClient.clear();
  });

  it('restores previous options and propagates normalized errors when save fails', async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const initialOptions = createOptions();
    const nextOptions = createOptions({ sonarrApiKey: 'changed' });
    const rawError = new Error('storage failed');
    const normalized = createNormalizedError({ message: 'normalized storage failed' });

    queryClient.setQueryData(queryKeys.options(), initialOptions);

    extensionOptionsMock.setValue.mockRejectedValue(rawError);
    extensionOptionsMock.watch.mockReturnValue(() => undefined);
    extensionOptionsMock.getValue.mockResolvedValue(initialOptions);
    normalizeErrorMock.mockReturnValueOnce(normalized);

    const { result } = renderHook(() => useSaveOptions(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(nextOptions)).rejects.toBe(normalized);
    });

    expect(extensionOptionsMock.setValue).toHaveBeenCalledWith(nextOptions);
    expect(queryClient.getQueryData(queryKeys.options())).toEqual(initialOptions);
    expect(normalizeErrorMock).toHaveBeenCalledWith(rawError);

    queryClient.clear();
  });
});

describe('useExtensionOptions', () => {
  it('hydrates from storage and responds to watch updates', async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const initial = createOptions();
    const updated = createOptions({ sonarrApiKey: 'updated-key' });
  const unsubscribe = vi.fn<() => void>();

    let watchCallback: ((value: ExtensionOptions) => void) | undefined;
    extensionOptionsMock.getValue.mockResolvedValue(initial);
    extensionOptionsMock.watch.mockImplementation(callback => {
      watchCallback = callback;
      return unsubscribe;
    });

    const { result, unmount } = renderHook(() => useExtensionOptions(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(initial));
    expect(extensionOptionsMock.watch).toHaveBeenCalledTimes(1);

    watchCallback?.(updated);

    await waitFor(() => expect(result.current.data).toEqual(updated));
    expect(queryClient.getQueryData(queryKeys.options())).toEqual(updated);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    queryClient.clear();
  });
});
