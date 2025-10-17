import { vi } from 'vitest';
import type { ExtensionOptions } from '@/types';

// Hoist-safe storage mock factory for '@/utils/storage'
// Usage in tests:
// vi.mock('@/utils/storage', () => makeUtilsStorageMock());
// Then, import { setMockExtensionOptionsValue, pushMockExtensionOptionsUpdate, resetMockExtensionOptions } from '@/utils/storage'
export const makeUtilsStorageMock = (initial?: ExtensionOptions | undefined) => {
  type Listener = (value: ExtensionOptions | undefined) => void;
  const listeners = new Set<Listener>();

  let currentValue: ExtensionOptions | undefined = initial;

  const createDefaultOptions = (): ExtensionOptions => ({
    sonarrUrl: '',
    sonarrApiKey: '',
    defaults: {
      qualityProfileId: '' as unknown as number,
      rootFolderPath: '',
      seriesType: 'anime',
      monitorOption: 'all',
      seasonFolder: true,
      searchForMissingEpisodes: true,
      tags: [],
    },
  });

  const getValue = vi.fn(async () => currentValue ?? createDefaultOptions());
  const setValue = vi.fn(async (value: ExtensionOptions) => {
    currentValue = value;
    listeners.forEach(l => l(value));
  });
  const watch = vi.fn((callback: Listener) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  });

  const setMockExtensionOptionsValue = (value: ExtensionOptions | undefined) => {
    currentValue = value;
  };
  const pushMockExtensionOptionsUpdate = (value: ExtensionOptions) => {
    currentValue = value;
    listeners.forEach(l => l(value));
  };
  const resetMockExtensionOptions = () => {
    currentValue = undefined;
    listeners.clear();
    getValue.mockClear();
    setValue.mockClear();
    watch.mockClear();
  };

  return {
    __esModule: true as const,
    extensionOptions: { getValue, setValue, watch },
    setMockExtensionOptionsValue,
    pushMockExtensionOptionsUpdate,
    resetMockExtensionOptions,
  };
};
