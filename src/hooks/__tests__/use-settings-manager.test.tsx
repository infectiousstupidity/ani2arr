import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

vi.mock('@/utils/logger', () => {
  const createLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  });

  const rootLogger = createLogger();

  return {
    logger: {
      ...rootLogger,
      create: vi.fn(() => createLogger()),
    },
  };
});

vi.mock('@/utils/validation', () => {
  return {
    validateUrl: vi.fn(),
    validateApiKey: vi.fn(),
    requestSonarrPermission: vi.fn(),
  };
});

const storageMocks = vi.hoisted(() => {
  type ExtensionOptions = import('@/types').ExtensionOptions;
  type Listener = (value: ExtensionOptions | undefined) => void;

  const listeners = new Set<Listener>();
  const createDefaultOptions = (): ExtensionOptions => ({
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
  });

  let currentValue: ExtensionOptions | undefined = createDefaultOptions();

  const getValue = vi.fn(async () => currentValue ?? createDefaultOptions());
  const setValue = vi.fn(async (value: ExtensionOptions) => {
    currentValue = value;
    listeners.forEach(listener => listener(value));
  });
  const watch = vi.fn((callback: Listener) => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  });

  const extensionOptions = {
    getValue,
    setValue,
    watch,
  } satisfies Record<string, unknown>;

  const setMockExtensionOptionsValue = (value: ExtensionOptions | undefined) => {
    currentValue = value;
  };

  const pushMockExtensionOptionsUpdate = (value: ExtensionOptions) => {
    currentValue = value;
    listeners.forEach(listener => listener(value));
  };

  const resetMockExtensionOptions = () => {
    currentValue = undefined;
    listeners.clear();
  };

  return {
    extensionOptions,
    setMockExtensionOptionsValue,
    pushMockExtensionOptionsUpdate,
    resetMockExtensionOptions,
  };
});

vi.mock('@/utils/storage', () => storageMocks);

const { setMockExtensionOptionsValue, pushMockExtensionOptionsUpdate, resetMockExtensionOptions } =
  storageMocks;

const serviceMocks = vi.hoisted(() => {
  type SonarrCredentialsPayload = import('@/types').SonarrCredentialsPayload;

  const defaultSonarrUrl = 'https://sonarr.test';

  const fetchSonarrMetadata = async (credentials?: SonarrCredentialsPayload) => {
    const baseUrl = (credentials?.url ?? defaultSonarrUrl).replace(/\/$/, '');
    const [qualityProfiles, rootFolders, tags] = await Promise.all([
      fetch(`${baseUrl}/api/v3/qualityprofile`).then(response => response.json()),
      fetch(`${baseUrl}/api/v3/rootfolder`).then(response => response.json()),
      fetch(`${baseUrl}/api/v3/tag`).then(response => response.json()),
    ]);

    return {
      qualityProfiles,
      rootFolders,
      tags,
    };
  };

  const testConnection = vi.fn(async () => ({ version: '4.0.0.0' }));
  const notifySettingsChanged = vi.fn(async () => ({ ok: true }));
  const getSonarrMetadata = vi.fn(fetchSonarrMetadata);

  const kitsunarrApiMock = {
    testConnection,
    notifySettingsChanged,
    getSonarrMetadata,
  } satisfies Record<string, unknown>;

  const resetKitsunarrApiMock = () => {
    testConnection.mockReset();
    testConnection.mockResolvedValue({ version: '4.0.0.0' });
    notifySettingsChanged.mockReset();
    notifySettingsChanged.mockResolvedValue({ ok: true });
    getSonarrMetadata.mockReset();
    getSonarrMetadata.mockImplementation(fetchSonarrMetadata);
  };

  return {
    registerKitsunarrApi: vi.fn(),
    getKitsunarrApi: vi.fn(() => kitsunarrApiMock),
    kitsunarrApiMock,
    resetKitsunarrApiMock,
  };
});

vi.mock('@/services', () => serviceMocks);

const { kitsunarrApiMock, resetKitsunarrApiMock } = serviceMocks;

import { useSettingsManager } from '../use-settings-manager';
import { queryKeys } from '../use-api-queries';
import { createSonarrQualityProfileFixture, createSonarrRootFolderFixture } from '@/testing/fixtures/sonarr';
import {
  createSonarrQualityProfileHandler,
  createSonarrRootFolderHandler,
  withLatency,
} from '@/testing/msw-server';
import { testServer, createExtensionOptionsFixture, createSonarrDefaultsFixture } from '@/testing';
import type { ExtensionOptions, SonarrFormState, SonarrQualityProfile, SonarrRootFolder } from '@/types';
import { extensionOptions } from '@/utils/storage';
import { requestSonarrPermission, validateApiKey, validateUrl } from '@/utils/validation';

const validateUrlMock = vi.mocked(validateUrl);
const validateApiKeyMock = vi.mocked(validateApiKey);
const requestSonarrPermissionMock = vi.mocked(requestSonarrPermission);

const createOptions = (overrides: Partial<ExtensionOptions> = {}): ExtensionOptions =>
  createExtensionOptionsFixture({
    ...overrides,
    defaults: createSonarrDefaultsFixture(overrides.defaults),
  });

const validUrl = 'https://sonarr.test';
const validApiKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const renderUseSettingsManager = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const hook = renderHook(() => useSettingsManager(), { wrapper });

  return { result: hook.result, queryClient };
};

beforeEach(() => {
  vi.clearAllMocks();
  validateUrlMock.mockImplementation(url => ({ isValid: true, normalizedUrl: url }));
  validateApiKeyMock.mockReturnValue({ isValid: true });
  requestSonarrPermissionMock.mockResolvedValue({ granted: true });
  resetMockExtensionOptions();
  resetKitsunarrApiMock();
});

afterEach(() => {
  resetMockExtensionOptions();
  resetKitsunarrApiMock();
});

describe('useSettingsManager', () => {
  it('auto-fills Sonarr defaults from metadata and refetches on refresh', async () => {
    const qualityProfile = createSonarrQualityProfileFixture({ id: 42, name: 'UltraHD' });
    const rootFolder = createSonarrRootFolderFixture({ path: '/anime/custom' });

    testServer.use(
      createSonarrQualityProfileHandler({
        profiles: [qualityProfile],
        ...withLatency<SonarrQualityProfile[]>(50),
      }),
      createSonarrRootFolderHandler({
        folders: [rootFolder],
        ...withLatency<SonarrRootFolder[]>(50),
      }),
    );

    setMockExtensionOptionsValue(
      createOptions({
        sonarrUrl: validUrl,
        sonarrApiKey: validApiKey,
        defaults: createSonarrDefaultsFixture({ qualityProfileId: '', rootFolderPath: '' }),
      }),
    );

    const { result, queryClient } = renderUseSettingsManager();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(kitsunarrApiMock.testConnection).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.sonarrMetadata.isLoading).toBe(true));
    await waitFor(() => expect(result.current.sonarrMetadata.isSuccess).toBe(true));

    expect(result.current.formState.defaults.qualityProfileId).toBe(qualityProfile.id);
    expect(result.current.formState.defaults.rootFolderPath).toBe(rootFolder.path);

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      result.current.handleRefresh();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.sonarrMetadata(`${validUrl}|${validApiKey}`),
    });

    await waitFor(() => expect(kitsunarrApiMock.getSonarrMetadata).toHaveBeenCalledTimes(2));
  });

  it('does not refresh metadata when connection has not been established', async () => {
    const { result, queryClient } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      result.current.handleRefresh();
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('validates inputs and requests permission before testing connection', async () => {
    const { result } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', validUrl);
      result.current.handleFieldChange('sonarrApiKey', validApiKey);
    });

    await act(async () => {
      await result.current.handleTestConnection();
    });

    expect(validateUrlMock).toHaveBeenCalledWith(validUrl);
    expect(validateApiKeyMock).toHaveBeenCalledWith(validApiKey);
    expect(requestSonarrPermissionMock).toHaveBeenCalledWith(validUrl);
    expect(kitsunarrApiMock.testConnection).toHaveBeenCalledWith({ url: validUrl, apiKey: validApiKey });
  });

  it('skips connection test when validation fails', async () => {
    validateUrlMock.mockReturnValueOnce({ isValid: false });

    const { result } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', 'notaurl');
      result.current.handleFieldChange('sonarrApiKey', validApiKey);
    });

    await act(async () => {
      await result.current.handleTestConnection();
    });

    expect(requestSonarrPermissionMock).not.toHaveBeenCalled();
    expect(kitsunarrApiMock.testConnection).not.toHaveBeenCalled();
  });

  it('skips connection test when permission is denied', async () => {
    requestSonarrPermissionMock.mockResolvedValueOnce({ granted: false });

    const { result } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', validUrl);
      result.current.handleFieldChange('sonarrApiKey', validApiKey);
    });

    await act(async () => {
      await result.current.handleTestConnection();
    });

    expect(kitsunarrApiMock.testConnection).not.toHaveBeenCalled();
  });

  it('resets the connection state', async () => {
    const { result } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', validUrl);
      result.current.handleFieldChange('sonarrApiKey', validApiKey);
    });

    await act(async () => {
      await result.current.handleTestConnection();
    });

    expect(result.current.testConnectionState.isSuccess).toBe(true);

    await act(async () => {
      result.current.resetConnection();
    });

    await waitFor(() => expect(result.current.testConnectionState.isSuccess).toBe(false));
    await waitFor(() => expect(result.current.isConnected).toBe(false));
  });

  it('does not attempt to save when the form is pristine', async () => {
    const { result } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleSave();
    });

    expect(requestSonarrPermissionMock).not.toHaveBeenCalled();
    expect(extensionOptions.setValue).not.toHaveBeenCalled();
  });

  it('aborts save when validation fails', async () => {
    validateUrlMock.mockReturnValueOnce({ isValid: false });

    const { result } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', 'bad-url');
      result.current.handleFieldChange('sonarrApiKey', validApiKey);
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(requestSonarrPermissionMock).not.toHaveBeenCalled();
    expect(kitsunarrApiMock.testConnection).not.toHaveBeenCalled();
    expect(extensionOptions.setValue).not.toHaveBeenCalled();
  });

  it('aborts save when permission is denied', async () => {
    requestSonarrPermissionMock.mockResolvedValueOnce({ granted: false });

    const { result } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', validUrl);
      result.current.handleFieldChange('sonarrApiKey', validApiKey);
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(kitsunarrApiMock.testConnection).not.toHaveBeenCalled();
    expect(extensionOptions.setValue).not.toHaveBeenCalled();
  });

  it('does not persist settings when the connection test fails', async () => {
    kitsunarrApiMock.testConnection.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', validUrl);
      result.current.handleFieldChange('sonarrApiKey', validApiKey);
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(extensionOptions.setValue).not.toHaveBeenCalled();
    expect(kitsunarrApiMock.notifySettingsChanged).not.toHaveBeenCalled();
  });

  it('saves settings after successful validation, permission, and connection test', async () => {
    const { result, queryClient } = renderUseSettingsManager();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.handleFieldChange('sonarrUrl', validUrl);
      result.current.handleFieldChange('sonarrApiKey', validApiKey);
    });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.handleSave();
    });

    await waitFor(() => expect(kitsunarrApiMock.testConnection).toHaveBeenCalled());
    await waitFor(() =>
      expect(extensionOptions.setValue).toHaveBeenCalledWith({
        sonarrUrl: validUrl,
        sonarrApiKey: validApiKey,
        defaults: createSonarrDefaultsFixture(),
      }),
    );
    await waitFor(() => expect(kitsunarrApiMock.notifySettingsChanged).toHaveBeenCalled());
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.options() }),
    );
  });

  it('tracks dirtiness against merged defaults and resets when saved state matches', async () => {
    const partialDefaults = {
      qualityProfileId: 7,
      rootFolderPath: '/existing',
    } as unknown as SonarrFormState;

    setMockExtensionOptionsValue(
      createOptions({
        sonarrUrl: validUrl,
        sonarrApiKey: validApiKey,
        defaults: partialDefaults,
      }),
    );

    const { result } = renderUseSettingsManager();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.formState.defaults.seriesType).toBe('anime');
    expect(result.current.isDirty).toBe(false);

    await act(async () => {
      result.current.handleDefaultsChange('qualityProfileId', 25);
    });

    await waitFor(() => expect(result.current.isDirty).toBe(true));

    await act(async () => {
      pushMockExtensionOptionsUpdate(result.current.formState);
    });

    await waitFor(() => expect(result.current.isDirty).toBe(false));
  });
});