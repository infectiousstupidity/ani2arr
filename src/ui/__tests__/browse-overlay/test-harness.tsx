import React from 'react';
import { afterEach, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserMock } from '@/testing';
import { createStatusStub, createAddSeriesStub } from '@/testing/mocks/useApiQueriesMock';
import type { CheckSeriesStatusPayload } from '@/types';
import type { BrowseAdapter, ParsedCard } from '@/types';

const hoisted = vi.hoisted(() => {
  const spies = {
    useSeriesStatusMock: vi.fn<(...args: unknown[]) => unknown>(),
    useAddSeriesMock: vi.fn<() => unknown>(),
    usePublicOptionsMock: vi.fn<() => { data: unknown }>(() => ({ data: null as unknown })),
  };

  const publicOptionsResult: {
    data: {
      sonarrUrl: string;
      defaults: Partial<import('@/types').SonarrFormState> | null;
      isConfigured: boolean;
    };
  } = {
    data: {
      sonarrUrl: 'http://sonarr.local',
      isConfigured: true,
      defaults: {
        qualityProfileId: 1,
        rootFolderPath: '/media',
        seriesType: 'standard',
        monitorOption: 'all',
        seasonFolder: false,
        searchForMissingEpisodes: false,
        tags: [],
      },
    },
  };

  const seriesStatusMap = new Map<
    number,
    {
      data: unknown | null;
      isError: boolean;
      error: unknown;
      isLoading: boolean;
      fetchStatus: 'idle' | 'fetching';
      refetch: ReturnType<typeof vi.fn>;
    }
  >();
  const currentAddSeriesResultRef: { value: ReturnType<typeof createAddSeriesStub> } = {
    value: {
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    },
  };

  spies.usePublicOptionsMock.mockImplementation(
    () => publicOptionsResult as unknown as { data: unknown },
  );
  spies.useSeriesStatusMock.mockImplementation((...args: unknown[]) => {
    const payload = args[0] as CheckSeriesStatusPayload;
    return (
      seriesStatusMap.get(payload.anilistId) ?? {
        data: null,
        isError: false,
        error: null,
        isLoading: false,
        fetchStatus: 'idle',
        refetch: vi.fn(() => Promise.resolve()),
      }
    );
  });
  spies.useAddSeriesMock.mockImplementation(() => currentAddSeriesResultRef.value);

  return { ...spies, publicOptionsResult, seriesStatusMap, currentAddSeriesResultRef } as const;
});

export { hoisted };

export const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>
  );
};

vi.mock('@/hooks/use-api-queries', () => ({
  __esModule: true,
  usePublicOptions: () => hoisted.usePublicOptionsMock(),
  useSeriesStatus: (...args: unknown[]) => hoisted.useSeriesStatusMock(args[0] as CheckSeriesStatusPayload),
  useAddSeries: () => hoisted.useAddSeriesMock(),
  useSonarrMetadata: () => ({ data: null }),
  useTestConnection: () => ({ mutate: vi.fn() }),
  useSaveOptions: () => ({ mutate: vi.fn() }),
}));

export const useKitsunarrBroadcastsMock = vi.fn();
export const useThemeMock = vi.fn();

export const TooltipWrapperMock = vi.fn(
  ({ children }: { children: React.ReactNode; container?: HTMLElement | null }) => <>{children}</>,
);

type AddSeriesModalProps = {
  anilistId?: number;
  title?: string;
  metadata?: unknown | null;
  portalContainer?: HTMLElement | null;
};

export const addSeriesModalSpy = vi.fn((props: AddSeriesModalProps) => (
  <div
    data-testid="add-series-modal"
    data-anilist-id={props.anilistId}
    data-title={props.title}
    data-portal-host={props.portalContainer ? 'present' : 'missing'}
  />
));

vi.mock('@/hooks/use-broadcasts', () => ({
  __esModule: true,
  useKitsunarrBroadcasts: () => useKitsunarrBroadcastsMock(),
}));

vi.mock('@/hooks/use-theme', () => ({
  __esModule: true,
  useTheme: (ref: React.RefObject<HTMLDivElement>) => useThemeMock(ref),
}));

vi.mock('@/ui/TooltipWrapper', () => ({
  __esModule: true,
  default: (props: { children: React.ReactNode; container?: HTMLElement | null }) =>
    TooltipWrapperMock(props),
}));

vi.mock('@/ui/AddSeriesModal', () => ({
  __esModule: true,
  default: (props: AddSeriesModalProps) => addSeriesModalSpy(props),
}));

vi.mock('wxt/browser', () => {
  const runtime = {
    openOptionsPage: vi.fn(() => Promise.resolve()),
  };
  const mockBrowser = { runtime };
  return createBrowserMock(mockBrowser);
});

let mutationObservers: MutationObserverMock[] = [];
let resizeObservers: ResizeObserverMock[] = [];

class MutationObserverMock implements MutationObserver {
  public readonly observe = vi.fn();
  public readonly disconnect = vi.fn();
  constructor(private readonly callback: MutationCallback) {
    mutationObservers.push(this);
  }
  takeRecords(): MutationRecord[] {
    return [];
  }
  trigger(records: Partial<MutationRecord>[]) {
    this.callback(records as MutationRecord[], this);
  }
}

class ResizeObserverMock implements ResizeObserver {
  public readonly observe = vi.fn((target: Element) => {
    if ((target as HTMLElement).dataset.throwResize === 'true') {
      throw new Error('observe failed');
    }
  });
  public readonly unobserve = vi.fn();
  public readonly disconnect = vi.fn();
  constructor(private readonly callback: ResizeObserverCallback) {
    resizeObservers.push(this);
  }
  trigger() {
    this.callback([], this);
  }
}

const originalMutationObserver = globalThis.MutationObserver;
const originalResizeObserver = globalThis.ResizeObserver;
const originalAlert = window.alert;

export const createCard = (id: number, title: string, options: { invalid?: boolean } = {}) => {
  const card = document.createElement('div');
  card.className = 'media-card';
  card.dataset.anilistId = String(id);
  card.dataset.title = title;
  if (options.invalid) {
    card.dataset.invalid = 'true';
  }
  const overlayHost = document.createElement('div');
  overlayHost.className = 'overlay-host';
  card.appendChild(overlayHost);
  return { card, overlayHost };
};

export const setupAdapter = (overrides: Partial<BrowseAdapter> = {}) => {
  const parseCard = vi.fn((card: Element): ParsedCard | null => {
    const element = card as HTMLElement;
    if (element.dataset.invalid === 'true') {
      return null;
    }
    const host = element.querySelector<HTMLElement>('.overlay-host');
    if (!host) return null;
    return {
      anilistId: Number(element.dataset.anilistId ?? 0),
      title: element.dataset.title ?? '',
      metadata: null,
      host,
    };
  });

  const ensureContainer = vi.fn((host: HTMLElement) => {
    let container = host.querySelector<HTMLElement>('.kitsunarr-container');
    if (!container) {
      container = host.ownerDocument.createElement('div');
      container.className = 'kitsunarr-container';
      host.appendChild(container);
    }
    return container;
  });

  const adapter: BrowseAdapter = {
    cardSelector: '.media-card',
    containerClassName: 'kitsunarr-container',
    processedAttribute: 'data-kitsunarr-test',
    parseCard,
    ensureContainer,
    onCardInvalid: vi.fn(),
    resizeObserverTargets: () => [document.body],
    ...overrides,
  };

  return { adapter, parseCard, ensureContainer };
};

export const getMutationObservers = () => mutationObservers;
export const getResizeObservers = () => resizeObservers;

beforeEach(() => {
  hoisted.publicOptionsResult.data = {
    sonarrUrl: 'http://sonarr.local',
    isConfigured: true,
    defaults: {
      qualityProfileId: 1,
      rootFolderPath: '/media',
      seriesType: 'standard',
      monitorOption: 'all',
      seasonFolder: false,
      searchForMissingEpisodes: false,
      tags: [],
    },
  };
  mutationObservers = [];
  resizeObservers = [];
  hoisted.seriesStatusMap.clear();
  hoisted.currentAddSeriesResultRef.value = createAddSeriesStub();
  hoisted.usePublicOptionsMock.mockImplementation(() => hoisted.publicOptionsResult);
  hoisted.useSeriesStatusMock.mockImplementation((...args: unknown[]) => {
    const payload = args[0] as { anilistId: number; title?: string };
    return hoisted.seriesStatusMap.get(payload.anilistId) ?? createStatusStub();
  });
  hoisted.useAddSeriesMock.mockImplementation(() => hoisted.currentAddSeriesResultRef.value);
  useThemeMock.mockClear();
  useKitsunarrBroadcastsMock.mockClear();
  TooltipWrapperMock.mockClear();
  addSeriesModalSpy.mockClear();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  Object.defineProperty(globalThis, 'MutationObserver', {
    configurable: true,
    writable: true,
    value: MutationObserverMock,
  });
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverMock,
  });
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'MutationObserver', {
    configurable: true,
    writable: true,
    value: originalMutationObserver,
  });
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: originalResizeObserver,
  });
  window.alert = originalAlert;
  hoisted.seriesStatusMap.clear();
  hoisted.currentAddSeriesResultRef.value = createAddSeriesStub();
});
