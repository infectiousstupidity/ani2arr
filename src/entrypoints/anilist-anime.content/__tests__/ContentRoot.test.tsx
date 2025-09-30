import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextEncoder as NodeTextEncoder } from 'node:util';

if (!(new NodeTextEncoder().encode('') instanceof Uint8Array)) {
  throw new Error('Node TextEncoder is not compatible with Uint8Array.');
}

Object.defineProperty(globalThis, 'TextEncoder', {
  configurable: true,
  writable: true,
  value: NodeTextEncoder,
});

const browserMocks = vi.hoisted(() => {
  type RuntimeListener = (message: unknown) => unknown | Promise<unknown>;
  type StorageListener = (
    changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
    areaName: string,
  ) => unknown | Promise<unknown>;

  const runtimeListeners = new Set<RuntimeListener>();
  const storageListeners = new Set<StorageListener>();
  const storageState: Record<string, unknown> = { libraryEpoch: 0, settingsEpoch: 0 };

  const sendMessageMock = vi.fn(async (message: unknown) => {
    await Promise.all([...runtimeListeners].map(listener => listener(message)));
    return undefined;
  });

  const openOptionsPageMock = vi.fn(async () => {});

  const storageLocalGetMock = vi.fn(async (defaults: Record<string, unknown> = {}) => ({
    ...defaults,
    ...storageState,
  }));

  const storageLocalSetMock = vi.fn(async (next: Record<string, unknown>) => {
    const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
    for (const [key, value] of Object.entries(next)) {
      const oldValue = storageState[key];
      storageState[key] = value;
      changes[key] = { oldValue, newValue: value };
    }
    await Promise.all([...storageListeners].map(listener => listener(changes, 'local')));
  });

  return {
    runtimeListeners,
    storageListeners,
    storageState,
    sendMessageMock,
    openOptionsPageMock,
    storageLocalGetMock,
    storageLocalSetMock,
  };
});

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: vi.fn((listener: (message: unknown) => unknown) => {
          browserMocks.runtimeListeners.add(listener);
        }),
        removeListener: vi.fn((listener: (message: unknown) => unknown) => {
          browserMocks.runtimeListeners.delete(listener);
        }),
      },
      sendMessage: browserMocks.sendMessageMock,
      openOptionsPage: browserMocks.openOptionsPageMock,
    },
    storage: {
      onChanged: {
        addListener: vi.fn((listener: typeof browserMocks.storageListeners extends Set<infer L> ? L : never) => {
          browserMocks.storageListeners.add(listener as never);
        }),
        removeListener: vi.fn((listener: typeof browserMocks.storageListeners extends Set<infer L> ? L : never) => {
          browserMocks.storageListeners.delete(listener as never);
        }),
      },
      local: {
        get: browserMocks.storageLocalGetMock,
        set: browserMocks.storageLocalSetMock,
      },
    },
  },
}));

import browser from 'webextension-polyfill';

const storageMocks = vi.hoisted(() => {
  const defaultOptions = {
    sonarrUrl: '',
    sonarrApiKey: '',
    defaults: {
      qualityProfileId: '',
      rootFolderPath: '',
      seriesType: 'anime' as const,
      monitorOption: 'all' as const,
      seasonFolder: true,
      searchForMissingEpisodes: true,
      tags: [] as number[],
    },
  } satisfies import('@/types').ExtensionOptions;

  let current: import('@/types').ExtensionOptions = structuredClone(defaultOptions);
  const watchers = new Set<(value: import('@/types').ExtensionOptions) => void>();

  const setOptions = (next: import('@/types').ExtensionOptions) => {
    current = structuredClone(next);
    watchers.forEach(callback => callback(structuredClone(current)));
  };

  const reset = () => {
    current = structuredClone(defaultOptions);
    watchers.clear();
  };

  return {
    defaultOptions,
    get options() {
      return structuredClone(current);
    },
    setOptions,
    reset,
    watchers,
  };
});

vi.mock('@/utils/storage', () => ({
  extensionOptions: {
    getValue: vi.fn(async () => storageMocks.options),
    setValue: vi.fn(async (value: import('@/types').ExtensionOptions) => {
      storageMocks.setOptions(value);
    }),
    watch: vi.fn((callback: (value: import('@/types').ExtensionOptions) => void) => {
      storageMocks.watchers.add(callback);
      return () => storageMocks.watchers.delete(callback);
    }),
  },
  __resetMockOptions: storageMocks.reset,
  __getMockDefaultOptions: () => structuredClone(storageMocks.defaultOptions),
}));

vi.mock('@/utils/validation', async () => {
  const actual = await vi.importActual<typeof import('@/utils/validation')>('@/utils/validation');
  return {
    ...actual,
    hasSonarrPermission: vi.fn().mockResolvedValue(true),
  };
});

const storageModule = await import('@/utils/storage');
const extensionOptions = storageModule.extensionOptions;
const { __resetMockOptions, __getMockDefaultOptions } = storageModule as typeof storageModule & {
  __resetMockOptions: () => void;
  __getMockDefaultOptions: () => import('@/types').ExtensionOptions;
};

import { ContentRoot } from '../index';
import {
  createAniListHandlers,
  createAniMediaFixture,
  createSonarrAddSeriesHandler,
  createSonarrLookupFixture,
  createSonarrLookupHandler,
  createSonarrSeriesHandler,
  createStaticMappingHandler,
  createStaticMappingPayload,
  defaultSonarrCredentials,
  primaryMappingUrl,
  fallbackMappingUrl,
  testServer,
} from '@/testing';
import type {
  CheckSeriesStatusResponse,
  ExtensionError,
  ExtensionOptions,
  SonarrSeries,
} from '@/types';

const staticMappingCache = new Map<'primary' | 'fallback', Map<number, number>>();
const resolvedMappingCache = new Map<number, { tvdbId: number; successfulSynonym?: string }>();
const localSeriesCache = new Map<number, { tvdbId: number; id: number; titleSlug: string }>();

const fetchJson = async <T,>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
};

const loadStaticMap = async (source: 'primary' | 'fallback'): Promise<Map<number, number>> => {
  const existing = staticMappingCache.get(source);
  if (existing) return existing;
  const url = source === 'primary' ? primaryMappingUrl : fallbackMappingUrl;
  const payload = await fetchJson<{ pairs: Record<number, number> }>(url);
  const map = new Map<number, number>(Object.entries(payload.pairs).map(([key, value]) => [Number(key), value]));
  staticMappingCache.set(source, map);
  return map;
};

const createExtensionError = (code: string, message: string, userMessage: string): ExtensionError => ({
  code: code as ExtensionError['code'],
  message,
  userMessage,
  timestamp: Date.now(),
});

const uniqueTerms = (terms: (string | null | undefined)[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const term of terms) {
    const trimmed = term?.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(trimmed);
  }
  return result;
};

const resolveMapping = async (
  anilistId: number,
  primaryTitleHint?: string,
): Promise<{ tvdbId: number; successfulSynonym?: string } | null> => {
  const cached = resolvedMappingCache.get(anilistId);
  if (cached) return cached;

  const primaryMap = await loadStaticMap('primary');
  const fallbackMap = await loadStaticMap('fallback');
  const staticTvdb = primaryMap.get(anilistId) ?? fallbackMap.get(anilistId) ?? null;
  if (typeof staticTvdb === 'number') {
    const mapping = { tvdbId: staticTvdb };
    resolvedMappingCache.set(anilistId, mapping);
    return mapping;
  }

  const aniResponse = await fetchJson<{ data: { Media: ReturnType<typeof createAniMediaFixture> } }>(
    'https://graphql.anilist.co',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ Media { id } }', variables: { id: anilistId } }),
    },
  );
  const media = aniResponse.data.Media;

  const terms = uniqueTerms([
    primaryTitleHint,
    media.title?.romaji,
    media.title?.english,
    media.title?.native,
    ...(Array.isArray(media.synonyms) ? media.synonyms : []),
  ]);

  for (const term of terms) {
    const lookupResults = await fetchJson<ReturnType<typeof createSonarrLookupFixture>[]>(
      `${defaultSonarrCredentials.url.replace(/\/$/, '')}/api/v3/series/lookup?term=${encodeURIComponent(term)}`,
    );
    const first = lookupResults[0];
    if (first) {
      const mapping = { tvdbId: first.tvdbId, successfulSynonym: term };
      resolvedMappingCache.set(anilistId, mapping);
      return mapping;
    }
  }

  return null;
};

const ensureSeriesCached = (series: SonarrSeries): void => {
  localSeriesCache.set(series.tvdbId, {
    tvdbId: series.tvdbId,
    id: series.id,
    titleSlug: series.titleSlug,
  });
};

const createTestApi = () => {
  let libraryEpoch = 0;
  let settingsEpoch = 0;

  const ensureConfigured = async (): Promise<ExtensionOptions> => {
    const options = await extensionOptions.getValue();
    if (!options?.sonarrUrl || !options?.sonarrApiKey) {
      throw createExtensionError(
        'SONARR_NOT_CONFIGURED',
        'Sonarr credentials are not configured.',
        'Configure your Sonarr connection in Kitsunarr options.',
      );
    }
    return options;
  };

  const getSeriesStatus = vi.fn(async (input: { anilistId: number; title?: string }): Promise<CheckSeriesStatusResponse> => {
    await ensureConfigured();
    const mapping = await resolveMapping(input.anilistId, input.title);
    if (!mapping) {
      return { exists: false, tvdbId: null, anilistTvdbLinkMissing: true };
    }

    const cachedSeries = localSeriesCache.get(mapping.tvdbId);
    let series = cachedSeries ?? null;
    if (!series) {
      const list = await fetchJson<SonarrSeries[]>(
        `${defaultSonarrCredentials.url.replace(/\/$/, '')}/api/v3/series?tvdbId=${mapping.tvdbId}`,
      );
      const first = list[0] ?? null;
      if (first) {
        ensureSeriesCached(first);
        series = localSeriesCache.get(mapping.tvdbId) ?? null;
      }
    }

    if (!series) {
      return {
        exists: false,
        tvdbId: mapping.tvdbId,
        ...(mapping.successfulSynonym ? { successfulSynonym: mapping.successfulSynonym } : {}),
      };
    }

    return {
      exists: true,
      tvdbId: mapping.tvdbId,
      series,
      ...(mapping.successfulSynonym ? { successfulSynonym: mapping.successfulSynonym } : {}),
    };
  });

  const addToSonarr = vi.fn(async (input: {
    anilistId: number;
    title: string;
    primaryTitleHint?: string;
    form: Record<string, unknown>;
  }): Promise<SonarrSeries> => {
    return (async () => {
      const options = await ensureConfigured();
      const mapping = await resolveMapping(input.anilistId, input.primaryTitleHint ?? input.title);
      if (!mapping) {
        throw createExtensionError('MAPPING_FAILED', 'Unable to resolve mapping.', 'Could not resolve TVDB mapping.');
      }

      const payload = {
        ...input.form,
        anilistId: input.anilistId,
        title: input.title,
        tvdbId: mapping.tvdbId,
      };

      const created = await fetchJson<SonarrSeries>(
        `${options.sonarrUrl.replace(/\/$/, '')}/api/v3/series`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      ensureSeriesCached(created);
      libraryEpoch += 1;
      await browser.storage.local.set({ libraryEpoch });
      await browser.runtime.sendMessage({
        _kitsunarr: true,
        topic: 'series-updated',
        payload: { epoch: libraryEpoch, tvdbId: created.tvdbId },
      });

      return created;
    })();
  });

  const getSonarrMetadata = vi.fn(async () => {
    const options = await ensureConfigured();
    const baseUrl = options.sonarrUrl.replace(/\/$/, '');
    const [qualityProfiles, rootFolders, tags] = await Promise.all([
      fetchJson(baseUrl + '/api/v3/qualityprofile'),
      fetchJson(baseUrl + '/api/v3/rootfolder'),
      fetchJson(baseUrl + '/api/v3/tag'),
    ]);
    return { qualityProfiles, rootFolders, tags };
  });

  const notifySettingsChanged = vi.fn(async () => {
    settingsEpoch += 1;
    await browser.storage.local.set({ settingsEpoch });
    await browser.runtime.sendMessage({
      _kitsunarr: true,
      topic: 'settings-changed',
      payload: { epoch: settingsEpoch },
    });
    return { ok: true } as const;
  });

  const api = {
    getSeriesStatus,
    addToSonarr,
    getSonarrMetadata,
    notifySettingsChanged,
    resolveMapping: vi.fn(async (input: { anilistId: number; primaryTitleHint?: string }) => {
      const mapping = await resolveMapping(input.anilistId, input.primaryTitleHint);
      if (!mapping) {
        throw createExtensionError('MAPPING_FAILED', 'Unable to resolve mapping.', 'Could not resolve TVDB mapping.');
      }
      return mapping;
    }),
    testConnection: vi.fn(async () => ({ version: '4.0.0.0' })),
    getQualityProfiles: vi.fn(),
    getRootFolders: vi.fn(),
    getTags: vi.fn(),
  };

  return { api, spies: { getSeriesStatus, addToSonarr, getSonarrMetadata } };
};

const apiState = { current: createTestApi() };

vi.mock('@/services', () => ({
  getKitsunarrApi: () => apiState.current.api,
  __resetTestApi: () => {
    resolvedMappingCache.clear();
    localSeriesCache.clear();
    apiState.current = createTestApi();
  },
  __getTestApiSpies: () => apiState.current.spies,
}));

const servicesModule = await import('@/services');
const { __resetTestApi, __getTestApiSpies } = servicesModule as typeof servicesModule & {
  __resetTestApi: () => void;
  __getTestApiSpies: () => ReturnType<typeof createTestApi>['spies'];
};

const configuredOptions: ExtensionOptions = {
  sonarrUrl: defaultSonarrCredentials.url,
  sonarrApiKey: defaultSonarrCredentials.apiKey,
  defaults: {
    qualityProfileId: 1,
    rootFolderPath: '/sonarr/anime',
    seriesType: 'anime',
    monitorOption: 'all',
    seasonFolder: true,
    searchForMissingEpisodes: true,
    tags: [],
  },
};

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderContentRoot = (
  props: { anilistId: number; title: string } = { anilistId: 12345, title: 'Kitsunarr Test' },
) => {
  const queryClient = createQueryClient();
  const user = userEvent.setup();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ContentRoot {...props} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient, user };
};

beforeEach(async () => {
  browserMocks.sendMessageMock.mockClear();
  browserMocks.openOptionsPageMock.mockClear();
  browserMocks.storageLocalGetMock.mockClear();
  browserMocks.storageLocalSetMock.mockClear();
  browserMocks.runtimeListeners.clear();
  browserMocks.storageListeners.clear();
  browserMocks.storageState.libraryEpoch = 0;
  browserMocks.storageState.settingsEpoch = 0;
  resolvedMappingCache.clear();
  localSeriesCache.clear();
  staticMappingCache.clear();
  __resetMockOptions();
  await extensionOptions.setValue(__getMockDefaultOptions());
  __resetTestApi();
  sessionStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

const findActionButton = async () =>
  screen.findByRole('button', {
    name: /Add to Sonarr|Checking Sonarr|In Sonarr|Error|Cannot add|Adding.../i,
  });


describe('ContentRoot', () => {
  it('alerts and opens options when quick add is attempted without configuration', async () => {
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const { user } = renderContentRoot();

    const quickAddButton = await findActionButton();
    await user.click(quickAddButton);

    expect(alertMock).toHaveBeenCalledWith('Please configure your Sonarr settings first.');
    expect(browser.runtime.openOptionsPage).toHaveBeenCalledTimes(1);

    alertMock.mockRestore();
  });

  it('transitions to "In Sonarr" after a successful quick add', async () => {
    await extensionOptions.setValue(configuredOptions);
    __resetTestApi();

    testServer.use(
      createSonarrSeriesHandler({ series: [] }),
      createSonarrAddSeriesHandler(),
    );

    const { user } = renderContentRoot();

    await waitFor(() => expect(__getTestApiSpies().getSeriesStatus).toHaveBeenCalled());

    const quickAddButton = await screen.findByRole('button', { name: 'Add to Sonarr' });
    await user.click(quickAddButton);

    await screen.findByRole('button', { name: 'In Sonarr' });
    expect(browserMocks.sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'series-updated' }),
    );
  });

  it('opens and closes the advanced options modal', async () => {
    await extensionOptions.setValue(configuredOptions);
    __resetTestApi();

    const { user } = renderContentRoot();

    const gearButton = await screen.findByRole('button', { name: 'Advanced options' });
    await user.click(gearButton);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInstanceOf(HTMLElement);

    const closeButton = await screen.findByRole('button', { name: 'Close' });
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('disables quick add when mapping fails to resolve a TVDB identifier', async () => {
    await extensionOptions.setValue(configuredOptions);
    __resetTestApi();

    testServer.use(
      createStaticMappingHandler('primary', { body: createStaticMappingPayload({}) }),
      createStaticMappingHandler('fallback', { body: createStaticMappingPayload({}) }),
      ...createAniListHandlers({ media: createAniMediaFixture({ id: 9999, synonyms: [] }) }),
      createSonarrLookupHandler({ results: [] }),
      createSonarrSeriesHandler({ series: [] }),
    );

    renderContentRoot({ anilistId: 9999, title: 'Unmapped Series' });

    const button = await screen.findByRole('button', { name: 'Cannot add' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('refetches status queries when a Kitsunarr broadcast is received', async () => {
    await extensionOptions.setValue(configuredOptions);
    __resetTestApi();

    testServer.use(createSonarrSeriesHandler({ series: [] }));

    renderContentRoot();

    await waitFor(() => expect(__getTestApiSpies().getSeriesStatus).toHaveBeenCalledTimes(1));

    await browser.runtime.sendMessage({
      _kitsunarr: true,
      topic: 'series-updated',
      payload: { epoch: 2 },
    });

    await waitFor(() => expect(__getTestApiSpies().getSeriesStatus).toHaveBeenCalledTimes(2));
  });

  it('prefers the successful synonym when building the Sonarr search link', async () => {
    await extensionOptions.setValue(configuredOptions);
    __resetTestApi();

    testServer.use(
      createStaticMappingHandler('primary', { body: createStaticMappingPayload({}) }),
      createStaticMappingHandler('fallback', { body: createStaticMappingPayload({}) }),
      ...createAniListHandlers({
        media: createAniMediaFixture({ id: 24680, synonyms: ['Custom Synonym'] }),
      }),
      createSonarrLookupHandler({
        results: [createSonarrLookupFixture({ title: 'Custom Synonym', tvdbId: 24680 })],
      }),
      createSonarrSeriesHandler({ series: [] }),
    );

    renderContentRoot({ anilistId: 24680, title: 'Search Title' });

    const link = await screen.findByRole('link');
    expect(link.getAttribute('href')).toBe(
      `${configuredOptions.sonarrUrl.replace(/\/$/, '')}/add/new?term=${encodeURIComponent('Custom Synonym')}`,
    );
  });
});
