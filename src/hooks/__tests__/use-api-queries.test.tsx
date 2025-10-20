import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExtensionOptions, ExtensionError, PublicOptions } from '@/types';
import { createExtensionOptionsFixture, createSonarrDefaultsFixture } from '@/testing';

const normalizeErrorMock = vi.hoisted(() => vi.fn<(error: unknown) => ExtensionError>());

vi.mock('@/utils/error-handling', () => ({
  normalizeError: normalizeErrorMock,
}));

const getKitsunarrApiMock = vi.hoisted(() => vi.fn());

vi.mock('@/services', () => ({
  getKitsunarrApi: getKitsunarrApiMock,
}));

const publicOptionsMock = vi.hoisted(() => ({
  getValue: vi.fn<() => Promise<PublicOptions>>(),
  setValue: vi.fn<(value: PublicOptions) => Promise<void>>(),
  watch: vi.fn<(callback: (value: PublicOptions) => void) => () => void>(),
}));

const sonarrSecretsMock = vi.hoisted(() => ({
  getValue: vi.fn<() => Promise<{ apiKey: string }>>(),
  setValue: vi.fn<(value: { apiKey: string }) => Promise<void>>(),
  watch: vi.fn<(callback: (value: { apiKey: string }) => void) => () => void>(),
}));

const getExtensionOptionsSnapshotMock = vi.hoisted(() => vi.fn<() => Promise<ExtensionOptions>>());
const setExtensionOptionsSnapshotMock = vi.hoisted(() => vi.fn<(value: ExtensionOptions) => Promise<void>>());
const getPublicOptionsSnapshotMock = vi.hoisted(() => vi.fn<() => Promise<PublicOptions>>());

vi.mock('@/utils/storage', () => ({
  publicOptions: publicOptionsMock,
  sonarrSecrets: sonarrSecretsMock,
  getExtensionOptionsSnapshot: getExtensionOptionsSnapshotMock,
  setExtensionOptionsSnapshot: setExtensionOptionsSnapshotMock,
  getPublicOptionsSnapshot: getPublicOptionsSnapshotMock,
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

const createOptions = (overrides?: Partial<ExtensionOptions>): ExtensionOptions => {
  const { defaults: defaultsOverride, ...rest } = overrides ?? {};
  return createExtensionOptionsFixture({
    sonarrUrl: 'http://localhost:8989',
    sonarrApiKey: 'secret',
    ...rest,
    defaults: createSonarrDefaultsFixture({
      qualityProfileId: 1,
      rootFolderPath: '/anime',
      seriesType: 'anime',
      monitorOption: 'all',
      seasonFolder: true,
      searchForMissingEpisodes: true,
      tags: [],
      ...defaultsOverride,
    }),
  });
};

const toPublicOptions = (options: ExtensionOptions): PublicOptions => ({
  sonarrUrl: options.sonarrUrl,
  defaults: options.defaults,
  isConfigured: Boolean(options.sonarrUrl && options.sonarrApiKey),
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
  publicOptionsMock.getValue.mockReset();
  publicOptionsMock.setValue.mockReset();
  publicOptionsMock.watch.mockReset();
  sonarrSecretsMock.getValue.mockReset();
  sonarrSecretsMock.setValue.mockReset();
  sonarrSecretsMock.watch.mockReset();
  getExtensionOptionsSnapshotMock.mockReset();
  setExtensionOptionsSnapshotMock.mockReset();
  getPublicOptionsSnapshotMock.mockReset();
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
    const initialPublic = toPublicOptions(initialOptions);

    queryClient.setQueryData(queryKeys.options(), initialOptions);
    queryClient.setQueryData(queryKeys.publicOptions(), initialPublic);

    setExtensionOptionsSnapshotMock.mockResolvedValue();
    mockApi.notifySettingsChanged.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useSaveOptions(), { wrapper });

    await act(async () => {
      const mutation = result.current.mutateAsync(nextOptions);
      await waitFor(() => {
        expect(queryClient.getQueryData(queryKeys.options())).toEqual(nextOptions);
      });
      await mutation;
    });

    expect(setExtensionOptionsSnapshotMock).toHaveBeenCalledWith(nextOptions);
    expect(mockApi.notifySettingsChanged).toHaveBeenCalled();

    const state = queryClient.getQueryState(queryKeys.options());
    expect(state?.isInvalidated).toBe(true);
    const publicState = queryClient.getQueryState(queryKeys.publicOptions());
    expect(publicState?.isInvalidated).toBe(true);

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

    setExtensionOptionsSnapshotMock.mockRejectedValue(rawError);
    normalizeErrorMock.mockReturnValueOnce(normalized);

    const { result } = renderHook(() => useSaveOptions(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(nextOptions)).rejects.toBe(normalized);
    });

    expect(setExtensionOptionsSnapshotMock).toHaveBeenCalledWith(nextOptions);
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
    const initialPublic = toPublicOptions(initial);
    const updatedPublic = toPublicOptions(updated);
    const unsubscribePublic = vi.fn<() => void>();
    const unsubscribeSecrets = vi.fn<() => void>();

    let publicCallback: ((value: PublicOptions) => void) | undefined;
    publicOptionsMock.getValue.mockResolvedValue(initialPublic);
    publicOptionsMock.watch.mockImplementation(callback => {
      publicCallback = callback;
      return unsubscribePublic;
    });
    sonarrSecretsMock.watch.mockReturnValue(unsubscribeSecrets);
    getExtensionOptionsSnapshotMock.mockResolvedValue(initial);

    const { result, unmount } = renderHook(() => useExtensionOptions(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(initial));
    expect(publicOptionsMock.watch).toHaveBeenCalledTimes(1);
    expect(sonarrSecretsMock.watch).toHaveBeenCalledTimes(1);

    getExtensionOptionsSnapshotMock.mockResolvedValueOnce(updated);
    publicCallback?.(updatedPublic);

    await waitFor(() => expect(result.current.data).toEqual(updated));
    expect(queryClient.getQueryData(queryKeys.options())).toEqual(updated);

    unmount();
    expect(unsubscribePublic).toHaveBeenCalledTimes(1);
    expect(unsubscribeSecrets).toHaveBeenCalledTimes(1);

    queryClient.clear();
  });
});

