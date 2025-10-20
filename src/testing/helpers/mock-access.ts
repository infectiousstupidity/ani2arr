import type { ExtensionOptions } from '@/types';
import type { vi } from 'vitest';

type MockFn = ReturnType<typeof vi.fn>;

type StorageMockHelpers = {
  setMockExtensionOptionsValue: (v: ExtensionOptions | undefined) => void;
  pushMockExtensionOptionsUpdate: (v: ExtensionOptions) => void;
  resetMockExtensionOptions: () => void;
  setExtensionOptionsSnapshot: MockFn;
  getExtensionOptionsSnapshot: MockFn;
  getPublicOptionsSnapshot: MockFn;
  __getMockDefaultOptions: () => ExtensionOptions;
};

type ServicesMockHelpers = {
  kitsunarrApiMock: {
    testConnection: MockFn;
    notifySettingsChanged: MockFn;
    getSonarrMetadata: MockFn;
  };
  resetKitsunarrApiMock: () => void;
};

export const getStorageMockHelpers = (storageModule: typeof import('@/utils/storage')) => {
  return storageModule as unknown as typeof storageModule & StorageMockHelpers;
};

export const getServicesMockHelpers = (servicesModule: typeof import('@/services')) => {
  return servicesModule as unknown as typeof servicesModule & ServicesMockHelpers;
};
