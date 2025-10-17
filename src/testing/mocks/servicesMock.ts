import { vi } from 'vitest';

// Hoist-safe services mock factory for '@/services'
// Usage:
// vi.mock('@/services', () => makeServicesMock());
export const makeServicesMock = () => {
  const testConnection = vi.fn(async () => ({ version: '4.0.0.0' }));
  const notifySettingsChanged = vi.fn(async () => ({ ok: true }));
  const getSonarrMetadata = vi.fn(async ({ url }: { url?: string } = {}) => {
    const baseUrl = (url ?? 'https://sonarr.test').replace(/\/$/, '');
    const [qualityProfiles, rootFolders, tags] = await Promise.all([
      fetch(`${baseUrl}/api/v3/qualityprofile`).then(r => r.json()),
      fetch(`${baseUrl}/api/v3/rootfolder`).then(r => r.json()),
      fetch(`${baseUrl}/api/v3/tag`).then(r => r.json()),
    ]);
    return { qualityProfiles, rootFolders, tags };
  });

  const kitsunarrApiMock = {
    testConnection,
    notifySettingsChanged,
    getSonarrMetadata,
  } as const;

  const registerKitsunarrApi = vi.fn();
  const getKitsunarrApi = vi.fn(() => kitsunarrApiMock);

  const resetKitsunarrApiMock = () => {
    testConnection.mockReset();
    testConnection.mockResolvedValue({ version: '4.0.0.0' });
    notifySettingsChanged.mockReset();
    notifySettingsChanged.mockResolvedValue({ ok: true });
    getSonarrMetadata.mockReset();
    getSonarrMetadata.mockImplementation(async ({ url }: { url?: string } = {}) => {
      const baseUrl = (url ?? 'https://sonarr.test').replace(/\/$/, '');
      const [qualityProfiles, rootFolders, tags] = await Promise.all([
        fetch(`${baseUrl}/api/v3/qualityprofile`).then(r => r.json()),
        fetch(`${baseUrl}/api/v3/rootfolder`).then(r => r.json()),
        fetch(`${baseUrl}/api/v3/tag`).then(r => r.json()),
      ]);
      return { qualityProfiles, rootFolders, tags };
    });
  };

  return {
    __esModule: true as const,
    registerKitsunarrApi,
    getKitsunarrApi,
    kitsunarrApiMock,
    resetKitsunarrApiMock,
  };
};
