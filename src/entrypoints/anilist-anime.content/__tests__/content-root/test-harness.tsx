import { afterEach, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createBrowserMock, makeUtilsStorageMock } from '@/testing';
import type { MediaMetadataHint } from '@/types';

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

export { browserMocks };
vi.mock('wxt/browser', () => {
  const mockBrowser = {
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
  } as const;

  return createBrowserMock(mockBrowser);
});

import { browser } from 'wxt/browser';
export { browser };


vi.mock( '@/utils/storage', () => makeUtilsStorageMock()); 



import { getStorageMockHelpers } from '@/testing';

const storageModule = await import('@/utils/storage');
const { resetMockExtensionOptions, setExtensionOptionsSnapshot, getExtensionOptionsSnapshot, __getMockDefaultOptions } =
  getStorageMockHelpers(storageModule);
export { setExtensionOptionsSnapshot, getExtensionOptionsSnapshot };

import { ContentRoot } from '../../index';
import {
  createAniMediaFixture,
  createSonarrLookupFixture,
  defaultSonarrCredentials,
  primaryMappingUrl,
  fallbackMappingUrl,
} from '@/testing';
export {
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
  LeanSonarrSeries,
  SonarrSeries,
} from '@/types';

const staticMappingCache = new Map<'primary' | 'fallback', Map<number, number>>();
const resolvedMappingCache = new Map<number, { tvdbId: number; successfulSynonym?: string }>();
const localSeriesCache = new Map<number, LeanSonarrSeries>();

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

    // Matching logic: find the first result whose title matches the term exactly (case-insensitive).
    // This is stricter than previous substring or partial matching and may affect mapping results.
        const normalizedTerm = term.trim().toLowerCase();
        const matchingResult = lookupResults.find(result => result.title?.trim().toLowerCase() === normalizedTerm);
    
        if (matchingResult) {
          const mapping = { tvdbId: matchingResult.tvdbId, successfulSynonym: term };
          resolvedMappingCache.set(anilistId, mapping);
          return mapping;
        }
  }

  return null;
};

const ensureSeriesCached = (series: SonarrSeries): void => {
  const alternateTitles = Array.isArray(series.alternateTitles)
    ? series.alternateTitles
        .map(item => item?.title?.trim())
        .filter((title): title is string => !!title)
    : [];

  localSeriesCache.set(series.tvdbId, {
    tvdbId: series.tvdbId,
    id: series.id,
    titleSlug: series.titleSlug,
    title: series.title,
    ...(alternateTitles.length > 0 ? { alternateTitles } : {}),
  });
};

const createTestApi = () => {
  let libraryEpoch = 0;
  let settingsEpoch = 0;

  const ensureConfigured = async (): Promise<ExtensionOptions> => {
    const options = await getExtensionOptionsSnapshot();
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
export { __resetTestApi, __getTestApiSpies };

export const configuredOptions: ExtensionOptions = {
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

export const renderContentRoot = (
  props: { anilistId: number; title: string; metadata?: MediaMetadataHint | null } = {
    anilistId: 12345,
    title: 'Kitsunarr Test',
    metadata: null,
  },
) => {
  const queryClient = createQueryClient();
  const user = userEvent.setup();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ContentRoot
          anilistId={props.anilistId}
          title={props.title}
          metadata={props.metadata ?? null}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient, user };
};


export let alertMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  alertMock = vi.fn();
  vi.stubGlobal('alert', alertMock);
  
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
  resetMockExtensionOptions();
  await setExtensionOptionsSnapshot(__getMockDefaultOptions());
  __resetTestApi();
  sessionStorage.clear();
});


afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

export const findActionButton = async () =>
  screen.findByRole('button', {
    name: /Add to Sonarr|Checking Sonarr|In Sonarr|Error|Cannot add|Adding.../i,
  });


