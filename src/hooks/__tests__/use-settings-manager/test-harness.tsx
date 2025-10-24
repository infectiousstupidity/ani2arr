import { beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import {
  makeUtilsStorageMock,
  makeServicesMock,
  getStorageMockHelpers,
  getServicesMockHelpers,
} from '@/testing';

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

vi.mock('@/utils/validation', async () => {
  const actual = await vi.importActual<typeof import('@/utils/validation')>('@/utils/validation');
  return {
    ...actual,
    validateUrl: vi.fn(),
    validateApiKey: vi.fn(),
    requestSonarrPermission: vi.fn(),
  };
});

vi.mock('@/utils/storage', () => makeUtilsStorageMock());

vi.mock('@/services', () => makeServicesMock());

import { useSettingsManager } from '../../use-settings-manager';
import { queryKeys } from '../../use-api-queries';
export { queryKeys };
import { createExtensionOptionsFixture, createSonarrDefaultsFixture } from '@/testing';
import type { ExtensionOptions } from '@/types';
import * as storageModule from '@/utils/storage';
import * as servicesModule from '@/services';

const {
  setMockExtensionOptionsValue,
  pushMockExtensionOptionsUpdate,
  resetMockExtensionOptions,
  setExtensionOptionsSnapshot: setExtensionOptionsSnapshotMock,
  __getMockDefaultOptions,
} = getStorageMockHelpers(storageModule);
export { setMockExtensionOptionsValue, pushMockExtensionOptionsUpdate, setExtensionOptionsSnapshotMock };

const { kitsunarrApiMock, resetKitsunarrApiMock } = getServicesMockHelpers(servicesModule);
export { kitsunarrApiMock, resetKitsunarrApiMock };
import * as validationUtils from '@/utils/validation';

export const validateUrlMock = vi.mocked(validationUtils.validateUrl);
export const validateApiKeyMock = vi.mocked(validationUtils.validateApiKey);
export const requestSonarrPermissionMock = vi.mocked(validationUtils.requestSonarrPermission);
export const buildSonarrPermissionPatternSpy = vi.spyOn(validationUtils, 'buildSonarrPermissionPattern');

export const createOptions = (overrides: Partial<ExtensionOptions> = {}): ExtensionOptions =>
  createExtensionOptionsFixture({
    ...overrides,
    defaults: createSonarrDefaultsFixture(overrides.defaults),
  });

export const validUrl = 'https://sonarr.test';
export const validUrlWithBasePath = 'https://sonarr.test/base';
export const validApiKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const alternateUrl = 'https://new-sonarr.test/app';
export const removalErrorMessage = 'Failed to update host permissions. Please try again.';

export const renderUseSettingsManager = () => {
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

beforeEach(async () => {
  vi.clearAllMocks();
  validateUrlMock.mockImplementation(url => ({ isValid: true, normalizedUrl: url }));
  validateApiKeyMock.mockReturnValue({ isValid: true });
  requestSonarrPermissionMock.mockResolvedValue({ granted: true });
  buildSonarrPermissionPatternSpy.mockClear();
  resetMockExtensionOptions();
  await setExtensionOptionsSnapshotMock(__getMockDefaultOptions());
  setExtensionOptionsSnapshotMock.mockClear();
  resetKitsunarrApiMock();
});

afterEach(() => {
  resetMockExtensionOptions();
  resetKitsunarrApiMock();
});

