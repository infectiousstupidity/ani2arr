import { vi } from 'vitest';
import type { ExtensionOptions, PublicOptions, SonarrSecrets } from '@/types';

// Hoist-safe storage mock factory for '@/utils/storage'
// Usage in tests:
// vi.mock('@/utils/storage', () => makeUtilsStorageMock());
// Then, import helpers exported from '@/utils/storage'.
export const makeUtilsStorageMock = (initial?: ExtensionOptions | undefined) => {
  type PublicListener = (value: PublicOptions) => void;
  type SecretsListener = (value: SonarrSecrets) => void;

  const publicListeners = new Set<PublicListener>();
  const secretsListeners = new Set<SecretsListener>();

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

  const cloneOptions = (value: ExtensionOptions): ExtensionOptions => ({
    sonarrUrl: value.sonarrUrl,
    sonarrApiKey: value.sonarrApiKey,
    defaults: { ...value.defaults },
  });

  let currentOptions = cloneOptions(initial ?? createDefaultOptions());

  const toPublic = (options: ExtensionOptions): PublicOptions => ({
    sonarrUrl: options.sonarrUrl,
    defaults: { ...options.defaults },
    isConfigured: Boolean(options.sonarrUrl && options.sonarrApiKey),
  });

  const toSecrets = (options: ExtensionOptions): SonarrSecrets => ({
    apiKey: options.sonarrApiKey,
  });

  const emitPublic = () => {
    const value = toPublic(currentOptions);
    publicListeners.forEach(listener => listener(value));
  };

  const emitSecrets = () => {
    const value = toSecrets(currentOptions);
    secretsListeners.forEach(listener => listener(value));
  };

  const publicGetValue = vi.fn(async () => toPublic(currentOptions));
  const publicSetValue = vi.fn(async (value: PublicOptions) => {
    currentOptions = cloneOptions({
      sonarrUrl: value.sonarrUrl,
      sonarrApiKey: currentOptions.sonarrApiKey,
      defaults: value.defaults,
    });
    emitPublic();
  });
  const publicWatch = vi.fn((listener: PublicListener) => {
    publicListeners.add(listener);
    return () => publicListeners.delete(listener);
  });

  const secretsGetValue = vi.fn(async () => toSecrets(currentOptions));
  const secretsSetValue = vi.fn(async (value: SonarrSecrets) => {
    currentOptions = cloneOptions({
      ...currentOptions,
      sonarrApiKey: value.apiKey,
    });
    emitSecrets();
  });
  const secretsWatch = vi.fn((listener: SecretsListener) => {
    secretsListeners.add(listener);
    return () => secretsListeners.delete(listener);
  });

  const getExtensionOptionsSnapshot = vi.fn(async () => cloneOptions(currentOptions));
  const setExtensionOptionsSnapshot = vi.fn(async (value: ExtensionOptions) => {
    currentOptions = cloneOptions(value);
    emitPublic();
    emitSecrets();
  });
  const getPublicOptionsSnapshot = vi.fn(async () => toPublic(currentOptions));

  const setMockExtensionOptionsValue = (value: ExtensionOptions | undefined) => {
    currentOptions = cloneOptions(value ?? createDefaultOptions());
  };

  const pushMockExtensionOptionsUpdate = (value: ExtensionOptions) => {
    currentOptions = cloneOptions(value);
    emitPublic();
    emitSecrets();
  };

  const resetMockExtensionOptions = () => {
    currentOptions = cloneOptions(createDefaultOptions());
    publicListeners.clear();
    secretsListeners.clear();
    publicGetValue.mockClear();
    publicSetValue.mockClear();
    publicWatch.mockClear();
    secretsGetValue.mockClear();
    secretsSetValue.mockClear();
    secretsWatch.mockClear();
    getExtensionOptionsSnapshot.mockClear();
    setExtensionOptionsSnapshot.mockClear();
    getPublicOptionsSnapshot.mockClear();
  };

  return {
    __esModule: true as const,
    publicOptions: { getValue: publicGetValue, setValue: publicSetValue, watch: publicWatch },
    sonarrSecrets: { getValue: secretsGetValue, setValue: secretsSetValue, watch: secretsWatch },
    getExtensionOptionsSnapshot,
    setExtensionOptionsSnapshot,
    getPublicOptionsSnapshot,
    setMockExtensionOptionsValue,
    pushMockExtensionOptionsUpdate,
    resetMockExtensionOptions,
    __getMockDefaultOptions: () => cloneOptions(createDefaultOptions()),
  };
};
