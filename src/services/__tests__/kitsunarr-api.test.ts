import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type {
  ExtensionOptions,
  SonarrCredentialsPayload,
  SonarrQualityProfile,
  SonarrRootFolder,
  SonarrSeries,
  SonarrTag,
  CheckSeriesStatusResponse,
} from '@/types';
import type { SonarrApiService } from '@/api/sonarr.api';
import type { MappingService } from '@/services/mapping';
import type { LibraryService } from '@/services/library.service';
import { extensionOptions } from '@/utils/storage';
import { ErrorCode } from '@/utils/error-handling';

type SonarrApiMock = {
  addSeries: SonarrApiService['addSeries'];
  getQualityProfiles: SonarrApiService['getQualityProfiles'];
  getRootFolders: SonarrApiService['getRootFolders'];
  getTags: SonarrApiService['getTags'];
  testConnection: SonarrApiService['testConnection'];
  getAllSeries: SonarrApiService['getAllSeries'];
  getSeriesByTvdbId: SonarrApiService['getSeriesByTvdbId'];
};

type MappingServiceMock = {
  resolveTvdbId: MappingService['resolveTvdbId'];
  initStaticPairs: MappingService['initStaticPairs'];
  resetLookupState: MappingService['resetLookupState'];
};

type LibraryServiceMock = {
  getSeriesStatus: LibraryService['getSeriesStatus'];
  refreshCache: LibraryService['refreshCache'];
  addSeriesToCache: LibraryService['addSeriesToCache'];
};

const hoisted = vi.hoisted(() => ({
  sonarrInstance: null as SonarrApiMock | null,
  mappingInstance: null as MappingServiceMock | null,
  libraryInstance: null as LibraryServiceMock | null,
}));

function createSonarrApiMock(overrides: Partial<Record<keyof SonarrApiMock, unknown>> = {}): SonarrApiMock {
  const base: Record<keyof SonarrApiMock, unknown> = {
    addSeries: vi.fn(),
    getQualityProfiles: vi.fn(),
    getRootFolders: vi.fn(),
    getTags: vi.fn(),
    testConnection: vi.fn(),
    getAllSeries: vi.fn(),
    getSeriesByTvdbId: vi.fn(),
  };
  return Object.assign(base, overrides) as SonarrApiMock;
}

function createMappingServiceMock(overrides: Partial<Record<keyof MappingServiceMock, unknown>> = {}): MappingServiceMock {
  const base: Record<keyof MappingServiceMock, unknown> = {
    resolveTvdbId: vi.fn(),
    initStaticPairs: vi.fn(),
    resetLookupState: vi.fn(),
  };
  return Object.assign(base, overrides) as MappingServiceMock;
}

function createLibraryServiceMock(overrides: Partial<Record<keyof LibraryServiceMock, unknown>> = {}): LibraryServiceMock {
  const base: Record<keyof LibraryServiceMock, unknown> = {
    getSeriesStatus: vi.fn(),
    refreshCache: vi.fn(),
    addSeriesToCache: vi.fn(),
  };
  return Object.assign(base, overrides) as LibraryServiceMock;
}

vi.mock('@/api/sonarr.api', () => ({
  SonarrApiService: vi.fn(() => {
    if (!hoisted.sonarrInstance) {
      throw new Error('sonarrInstance not set before import');
    }
    return hoisted.sonarrInstance;
  }),
}));

vi.mock('@/services/mapping', () => ({
  MappingService: vi.fn(() => {
    if (!hoisted.mappingInstance) {
      throw new Error('mappingInstance not set before import');
    }
    return hoisted.mappingInstance;
  }),
}));

vi.mock('@/services/library.service', () => ({
  LibraryService: vi.fn(() => {
    if (!hoisted.libraryInstance) {
      throw new Error('libraryInstance not set before import');
    }
    return hoisted.libraryInstance;
  }),
}));

const baseOptions: ExtensionOptions = {
  sonarrUrl: 'https://sonarr.test',
  sonarrApiKey: 'api-123',
  defaults: {
    qualityProfileId: 1,
    rootFolderPath: '/anime',
    seriesType: 'anime',
    monitorOption: 'all',
    seasonFolder: true,
    searchForMissingEpisodes: true,
    tags: [7],
  },
};

const cloneOptions = (options: ExtensionOptions): ExtensionOptions =>
  JSON.parse(JSON.stringify(options)) as ExtensionOptions;

async function createService(overrides: {
  sonarr?: SonarrApiMock;
  mapping?: MappingServiceMock;
  library?: LibraryServiceMock;
} = {}) {
  hoisted.sonarrInstance = overrides.sonarr ?? createSonarrApiMock();
  hoisted.mappingInstance = overrides.mapping ?? createMappingServiceMock();
  hoisted.libraryInstance = overrides.library ?? createLibraryServiceMock();

  const mod = await import('@/services/index');
  const service = mod.registerKitsunarrApi();
  return { service, sonarr: hoisted.sonarrInstance!, mapping: hoisted.mappingInstance!, library: hoisted.libraryInstance! };
}

afterEach(() => {
  hoisted.sonarrInstance = null;
  hoisted.mappingInstance = null;
  hoisted.libraryInstance = null;
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('KitsunarrApi service', () => {
  it('throws SONARR_NOT_CONFIGURED when credentials are missing', async () => {
    const { service, library } = await createService();
    (library.getSeriesStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ exists: false, tvdbId: null });

    await expect(service.getSeriesStatus({ anilistId: 42 })).rejects.toMatchObject({
      code: ErrorCode.SONARR_NOT_CONFIGURED,
    });
    expect(library.getSeriesStatus).not.toHaveBeenCalled();
  });

  it('delegates getSeriesStatus without touching epochs or broadcasting', async () => {
    const { service, library } = await createService();
    await extensionOptions.setValue(cloneOptions(baseOptions));
    const sendMessageSpy = vi.spyOn(fakeBrowser.runtime, 'sendMessage');

    const expected: CheckSeriesStatusResponse = { exists: true, tvdbId: 500 };
    (library.getSeriesStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce(expected);

    const result = await service.getSeriesStatus({
      anilistId: 7,
      title: 'My Anime',
      force_verify: true,
      network: 'never',
      ignoreFailureCache: true,
    });

    expect(result).toEqual(expected);
    expect(library.getSeriesStatus).toHaveBeenCalledWith(
      { anilistId: 7, title: 'My Anime' },
      { force_verify: true, network: 'never', ignoreFailureCache: true },
    );

    const storedEpochs = await fakeBrowser.storage.local.get({ libraryEpoch: undefined, settingsEpoch: undefined });
    expect(storedEpochs).toEqual({ libraryEpoch: undefined, settingsEpoch: undefined });
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('merges payloads when adding to Sonarr and broadcasts epoch with tvdbId', async () => {
    const { service, sonarr, mapping, library } = await createService();
    await extensionOptions.setValue(cloneOptions(baseOptions));

    (mapping.resolveTvdbId as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ tvdbId: 321 });
    const created: SonarrSeries = { id: 99, title: 'Added', tvdbId: 321, titleSlug: 'added' };
    (sonarr.addSeries as ReturnType<typeof vi.fn>).mockResolvedValueOnce(created);
    (library.refreshCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const runtimeMessages: unknown[] = [];
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation(async message => {
      runtimeMessages.push(message);
      return undefined as never;
    });

    const payload = {
      anilistId: 88,
      title: 'Desired',
      primaryTitleHint: 'Hinted',
      form: {
        qualityProfileId: 10,
        rootFolderPath: '/new',
        monitorOption: 'all' as const,
        seasonFolder: false,
        searchForMissingEpisodes: false,
        seriesType: 'anime' as const,
        tags: [3, 4],
      },
    };

    const result = await service.addToSonarr(payload);

    expect(result).toEqual(created);
    expect(mapping.resolveTvdbId).toHaveBeenCalledWith(88, {
      ignoreFailureCache: true,
      hints: { primaryTitle: 'Hinted' },
    });
    expect(sonarr.addSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        anilistId: 88,
        title: 'Desired',
        tvdbId: 321,
        qualityProfileId: 10,
        rootFolderPath: '/new',
      }),
      expect.objectContaining({
        sonarrUrl: baseOptions.sonarrUrl,
        sonarrApiKey: baseOptions.sonarrApiKey,
        defaults: expect.objectContaining(baseOptions.defaults),
      }),
    );
    expect(library.addSeriesToCache).toHaveBeenCalledWith(created);
    expect(library.refreshCache).toHaveBeenCalledWith(
      expect.objectContaining({
        sonarrUrl: baseOptions.sonarrUrl,
        sonarrApiKey: baseOptions.sonarrApiKey,
        defaults: expect.objectContaining(baseOptions.defaults),
      }),
    );

    const storedEpochs = await fakeBrowser.storage.local.get({ libraryEpoch: 0 });
    expect(storedEpochs.libraryEpoch).toBe(1);
    expect(runtimeMessages).toEqual([
      { _kitsunarr: true, topic: 'series-updated', payload: { epoch: 1, tvdbId: 321 } },
    ]);
  });

  it('refreshes cache and broadcasts on notifySettingsChanged when configured', async () => {
    const { service, library, mapping } = await createService();
    await extensionOptions.setValue(cloneOptions(baseOptions));
    (library.refreshCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const runtimeMessages: unknown[] = [];
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation(async message => {
      runtimeMessages.push(message);
      return undefined as never;
    });

    const response = await service.notifySettingsChanged();
    expect(response).toEqual({ ok: true });

    expect(mapping.resetLookupState).toHaveBeenCalledTimes(1);
    expect(library.refreshCache).toHaveBeenCalledWith(
      expect.objectContaining({
        sonarrUrl: baseOptions.sonarrUrl,
        sonarrApiKey: baseOptions.sonarrApiKey,
        defaults: expect.objectContaining(baseOptions.defaults),
      }),
    );

    const epochs = await fakeBrowser.storage.local.get({ libraryEpoch: 0, settingsEpoch: 0 });
    expect(epochs.settingsEpoch).toBe(1);
    expect(epochs.libraryEpoch).toBe(1);

    expect(runtimeMessages).toEqual([
      { _kitsunarr: true, topic: 'settings-changed', payload: { epoch: 1 } },
      { _kitsunarr: true, topic: 'series-updated', payload: { epoch: 1 } },
    ]);
  });

  it('delegates initMappings without broadcasting', async () => {
    const { service, mapping } = await createService();
    (mapping.initStaticPairs as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const sendSpy = vi.spyOn(fakeBrowser.runtime, 'sendMessage');

    await service.initMappings();
    expect(mapping.initStaticPairs).toHaveBeenCalledTimes(1);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('prefers provided credentials when fetching Sonarr metadata', async () => {
    const directCredentials: SonarrCredentialsPayload = { url: 'https://override', apiKey: 'override-key' };
    const sonarrMock = createSonarrApiMock({
      getQualityProfiles: vi.fn().mockResolvedValue([{ id: 1, name: 'HD' } satisfies SonarrQualityProfile]),
      getRootFolders: vi.fn().mockResolvedValue([{ id: 2, path: '/shows' } satisfies SonarrRootFolder]),
      getTags: vi.fn().mockResolvedValue([{ id: 3, label: 'tag' } satisfies SonarrTag]),
    });
    const { service, sonarr } = await createService({ sonarr: sonarrMock });

    await extensionOptions.setValue(
      cloneOptions({
        ...baseOptions,
        sonarrUrl: 'https://stored',
        sonarrApiKey: 'stored-key',
      }),
    );

    const getValueSpy = vi.spyOn(extensionOptions, 'getValue');

    const metadata = await service.getSonarrMetadata({ credentials: directCredentials });

    expect(metadata).toEqual({
      qualityProfiles: [{ id: 1, name: 'HD' }],
      rootFolders: [{ id: 2, path: '/shows' }],
      tags: [{ id: 3, label: 'tag' }],
    });

    expect(sonarr.getQualityProfiles).toHaveBeenCalledWith(directCredentials);
    expect(sonarr.getRootFolders).toHaveBeenCalledWith(directCredentials);
    expect(sonarr.getTags).toHaveBeenCalledWith(directCredentials);
    expect(getValueSpy).not.toHaveBeenCalled();
  });
});
