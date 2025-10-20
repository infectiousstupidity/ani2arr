import React from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createBrowserMock, flushAsync, setLocationHref } from '@/testing';

vi.mock('wxt/browser', () => createBrowserMock());

const persistCallbackMock = vi.fn();
const persistQueryClientMock = vi.fn(() => [persistCallbackMock, Promise.resolve()]);

vi.mock('@tanstack/query-persist-client-core', () => ({
  persistQueryClient: persistQueryClientMock,
}));

vi.mock('@/cache/query-cache', () => ({
  queryPersister: {
    persistClient: vi.fn(),
    restoreClient: vi.fn(),
    removeClient: vi.fn(),
  },
  shouldPersistQuery: vi.fn(() => true),
}));

const useThemeMock = vi.fn();
const useKitsunarrBroadcastsMock = vi.fn();
const useSeriesStatusMock = vi.fn(() => ({
  data: {
    exists: false,
    tvdbId: 9876,
    successfulSynonym: 'Preferred Title',
    anilistTvdbLinkMissing: false,
  },
  fetchStatus: 'idle' as const,
  isError: false,
}));
const useAddSeriesMock = vi.fn(() => ({
  mutate: vi.fn(),
  isSuccess: false,
  isPending: false,
  isError: false,
  data: null,
}));
const usePublicOptionsMock = vi.fn(() => ({
  data: {
    sonarrUrl: 'https://sonarr.test',
    isConfigured: true,
    defaults: {
      qualityProfileId: 1,
      rootFolderPath: '/library/anime',
      seriesType: 'anime' as const,
      monitorOption: 'all' as const,
      seasonFolder: true,
      searchForMissingEpisodes: true,
      tags: [] as number[],
    },
  },
}));

vi.mock('@/hooks/use-theme', () => ({
  useTheme: (ref: React.RefObject<HTMLDivElement>) => useThemeMock(ref),
}));

vi.mock('@/hooks/use-broadcasts', () => ({
  useKitsunarrBroadcasts: () => useKitsunarrBroadcastsMock(),
}));

import { makeUseApiQueriesMock } from '@/testing/mocks/useApiQueriesMock';
vi.mock('@/hooks/use-api-queries', () =>
  makeUseApiQueriesMock({
    useSeriesStatus: (...args: unknown[]) => {
      const res = useSeriesStatusMock(...(args as Parameters<typeof useSeriesStatusMock>));
      // Ensure full stub shape
      return {
        error: null,
        isLoading: false,
        refetch: vi.fn(),
        ...res,
      } as typeof res & { error: unknown; isLoading: boolean; refetch: ReturnType<typeof vi.fn> };
    },
    useAddSeries: () => {
      const res = useAddSeriesMock();
      return {
        error: null,
        reset: vi.fn(),
        ...res,
      } as typeof res & { error: unknown; reset: ReturnType<typeof vi.fn> };
    },
    usePublicOptions: () => usePublicOptionsMock(),
  }),
);

const actionGroupProps: Array<Record<string, unknown>> = [];

vi.mock('@/ui/SonarrActionGroup', () => ({
  default: (props: Record<string, unknown>) => {
    actionGroupProps.push(props);
    return (
      <div data-testid="sonarr-action-group" data-status={props.status as string}>
        {props.animeTitle as string}
      </div>
    );
  },
}));

vi.mock('@/ui/AddSeriesModal', () => ({
  default: () => <div data-testid="add-series-modal" />,
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    create: () => ({
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

type GlobalWithWxt = typeof globalThis & {
  defineContentScript?: <T>(definition: T) => T | undefined;
  MatchPattern?: new (pattern: string) => { includes(url: string): boolean };
  ResizeObserver?: typeof ResizeObserver;
};

const g = globalThis as GlobalWithWxt;
const originalDefineContentScript = g.defineContentScript;
const originalMatchPattern = g.MatchPattern;
const originalResizeObserver = g.ResizeObserver;
const originalWindowLocation = window.location;
const originalGlobalLocation = globalThis.location;

class TestMatchPattern {
  constructor(private readonly pattern: string) {}

  includes(url: string) {
    if (this.pattern !== '*://anilist.co/anime/*') return false;
    return /:\/\/anilist\.co\/anime\//.test(url);
  }
}

class TestResizeObserver {
  public observe = vi.fn();
  public disconnect = vi.fn();
  constructor(private readonly callback: ResizeObserverCallback) {}
  trigger(target: Element) {
    const entry = {
      target,
      contentRect: target.getBoundingClientRect(),
    } as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
}

type ContextFactoryResult = {
  ctx: ContentScriptContext;
  notifyInvalidated: () => void;
};

const createTestContext = (): ContextFactoryResult => {
  const invalidationCallbacks = new Set<() => void>();
  const context: Partial<ContentScriptContext> = {
    addEventListener: ((target: EventTarget, type: string, handler: EventListenerOrEventListenerObject) => {
      target.addEventListener(type, handler as EventListener);
    }) as ContentScriptContext['addEventListener'],
    onInvalidated: ((callback: () => void) => {
      invalidationCallbacks.add(callback);
      return () => invalidationCallbacks.delete(callback);
    }) as ContentScriptContext['onInvalidated'],
  };

  return {
    ctx: context as ContentScriptContext,
    notifyInvalidated: () => {
      for (const cb of invalidationCallbacks) cb();
    },
  };
};

const setupDom = (title: string) => {
  document.body.innerHTML = `
    <div class="header">
      <div class="cover-wrap">
        <div class="actions">
          <button class="favourite"></button>
          <div class="list">List row</div>
        </div>
      </div>
    </div>
    <div class="content container">
      <div class="sidebar">
        <div class="rankings">Rankings</div>
      </div>
    </div>
    <main>
      <h1>${title}</h1>
    </main>
  `;
};

beforeEach(() => {
  vi.resetModules();
  actionGroupProps.length = 0;
  useSeriesStatusMock.mockClear();
  useAddSeriesMock.mockClear();
  usePublicOptionsMock.mockClear();
  useThemeMock.mockClear();
  useKitsunarrBroadcastsMock.mockClear();
  persistCallbackMock.mockClear();

  setLocationHref('https://anilist.co/anime/123');

  (window as unknown as Record<string, unknown>).defineContentScript = ((definition: unknown) => definition) as unknown as (
    (definition: unknown) => unknown
  );
  g.MatchPattern = TestMatchPattern;
  g.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

afterAll(() => {
  if (originalDefineContentScript)
    (window as unknown as Record<string, unknown>).defineContentScript = originalDefineContentScript as unknown as (
      (definition: unknown) => unknown
    );
  else delete (window as unknown as Record<string, unknown>).defineContentScript;

  if (originalMatchPattern) g.MatchPattern = originalMatchPattern;
  else delete g.MatchPattern;
  if (originalMatchPattern) (window as unknown as Record<string, unknown>).MatchPattern = originalMatchPattern;
  else delete (window as unknown as Record<string, unknown>).MatchPattern;

  if (originalResizeObserver) g.ResizeObserver = originalResizeObserver;
  else delete g.ResizeObserver;

  Object.defineProperty(window, 'location', {
    configurable: true,
    enumerable: true,
    value: originalWindowLocation,
  });
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    enumerable: true,
    value: originalGlobalLocation,
  });
});

describe('AniList anime content script integration', () => {
  it('mounts UI on anime pages and cleans up when invalidated', async () => {
    setupDom('Kitsunarr Title');
    const { ctx, notifyInvalidated } = createTestContext();

    const module = await import('../index');
    const { persistQueryClient } = await import('@tanstack/query-persist-client-core');
    expect(module.default.main).toBeInstanceOf(Function);

    await act(async () => {
      await module.default.main?.(ctx);
    });

    expect(actionGroupProps.length).toBeGreaterThan(0);
    expect(actionGroupProps.at(-1)).toMatchObject({
      status: 'NOT_IN_SONARR',
      animeTitle: 'Kitsunarr Title',
      resolvedSearchTerm: 'Preferred Title',
    });
    expect(document.getElementById('kitsunarr-actions-spacer')).toBeInstanceOf(HTMLElement);

    await act(async () => {
      notifyInvalidated();
    });

    expect(document.getElementById('kitsunarr-actions-spacer')).toBeNull();
    expect(persistQueryClient).toHaveBeenCalledWith(
      expect.objectContaining({
        dehydrateOptions: expect.objectContaining({
          shouldDehydrateQuery: expect.any(Function),
        }),
      }),
    );
  });

  it('responds to location changes by removing and remounting the UI', async () => {
    setupDom('Initial Title');
    const { ctx } = createTestContext();

    const module = await import('../index');
    expect(module.default.main).toBeInstanceOf(Function);

    await act(async () => {
      await module.default.main?.(ctx);
    });
    expect(actionGroupProps.some(props => props.animeTitle === 'Initial Title')).toBe(true);
    expect(document.getElementById('kitsunarr-actions-spacer')).toBeInstanceOf(HTMLElement);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('wxt:locationchange', {
          detail: { newUrl: new URL('https://anilist.co/browse') },
        }),
      );
      await flushAsync();
    });

    expect(document.getElementById('kitsunarr-actions-spacer')).toBeNull();

    document.querySelector('h1')!.textContent = 'Second Title';
    setLocationHref('https://anilist.co/anime/456');
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('wxt:locationchange', {
          detail: { newUrl: new URL(window.location.href) },
        }),
      );
      await flushAsync();
    });

    expect(document.getElementById('kitsunarr-actions-spacer')).toBeInstanceOf(HTMLElement);
    expect(actionGroupProps.some(props => props.animeTitle === 'Second Title')).toBe(true);
    expect(actionGroupProps.at(-1)).toMatchObject({
      animeTitle: 'Second Title',
      status: 'NOT_IN_SONARR',
    });
    expect(useSeriesStatusMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ anilistId: 456, title: 'Second Title' }),
      expect.objectContaining({ enabled: true }),
    );
  });

  it('skips mounting when the AniList identifier cannot be parsed', async () => {
    setLocationHref('https://anilist.co/anime/');
    setupDom('Unreachable Title');
    const { ctx } = createTestContext();

    const module = await import('../index');
    expect(module.default.main).toBeInstanceOf(Function);

    await act(async () => {
      await module.default.main?.(ctx);
    });

    expect(actionGroupProps).toHaveLength(0);
    expect(document.getElementById('kitsunarr-actions-spacer')).toBeNull();
  });
});
