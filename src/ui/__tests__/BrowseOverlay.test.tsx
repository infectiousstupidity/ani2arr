import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createBrowserMock } from '@/testing';
import { createStatusStub, createAddSeriesStub } from '@/testing/mocks/useApiQueriesMock';
import type { CheckSeriesStatusPayload } from '@/types';

import type { BrowseAdapter, ParsedCard } from '@/types';
import { createBrowseContentApp } from '@/ui/BrowseOverlay';
// Hoisted spies + state for use-api-queries
const hoisted = vi.hoisted(() => {
  const spies = {
    // Type spies loosely (unknown) to avoid narrowing issues when overriding implementations
    useSeriesStatusMock: vi.fn<(...args: unknown[]) => unknown>(),
    useAddSeriesMock: vi.fn<() => unknown>(),
    usePublicOptionsMock: vi.fn<() => { data: unknown }>(() => ({ data: null as unknown })),
  };

  const publicOptionsResult: {
    data: { sonarrUrl: string; defaults: Partial<import('@/types').SonarrFormState> | null; isConfigured: boolean };
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

  const seriesStatusMap = new Map<number, {
    data: unknown | null;
    isError: boolean;
    error: unknown;
    isLoading: boolean;
    fetchStatus: 'idle' | 'fetching';
    refetch: ReturnType<typeof vi.fn>;
  }>();
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

  // Default spy implementations, can be overridden in tests
  spies.usePublicOptionsMock.mockImplementation(() => publicOptionsResult as unknown as { data: unknown });
  spies.useSeriesStatusMock.mockImplementation((...args: unknown[]) => {
    const payload = args[0] as CheckSeriesStatusPayload;
    return seriesStatusMap.get(payload.anilistId) ?? {
      data: null,
      isError: false,
      error: null,
      isLoading: false,
      fetchStatus: 'idle',
      refetch: vi.fn(() => Promise.resolve()),
    };
  });
  spies.useAddSeriesMock.mockImplementation(() => currentAddSeriesResultRef.value);

  return { ...spies, publicOptionsResult, seriesStatusMap, currentAddSeriesResultRef } as const;
});

// Use hoist-safe vi.mock with overrides that delegate to the local spies above
vi.mock('@/hooks/use-api-queries', () => ({
  __esModule: true,
  usePublicOptions: () => hoisted.usePublicOptionsMock(),
  useSeriesStatus: (...args: unknown[]) => hoisted.useSeriesStatusMock(args[0] as CheckSeriesStatusPayload),
  useAddSeries: () => hoisted.useAddSeriesMock(),
  useSonarrMetadata: () => ({ data: null }),
  useTestConnection: () => ({ mutate: vi.fn() }),
  useSaveOptions: () => ({ mutate: vi.fn() }),
}));

const useKitsunarrBroadcastsMock = vi.fn();
const useThemeMock = vi.fn();

const TooltipWrapperMock = vi.fn(
  ({ children }: { children: React.ReactNode; container?: HTMLElement | null }) => <>{children}</>,
);

type AddSeriesModalProps = {
  anilistId?: number;
  title?: string;
  metadata?: unknown | null;
  portalContainer?: HTMLElement | null;
};
const addSeriesModalSpy = vi.fn((props: AddSeriesModalProps) => (
  <div
    data-testid="add-series-modal"
    data-anilist-id={props.anilistId}
    data-title={props.title}
    data-portal-host={props.portalContainer ? 'present' : 'missing'}
  />
));

// (duplicate vi.mock for '@/hooks/use-api-queries' removed; consolidated above)

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
  default: (props: { children: React.ReactNode; container?: HTMLElement | null }) => TooltipWrapperMock(props),
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

// Use centralized stub creators via import; local types not required

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
  public readonly observe = vi.fn((target: Element, _options?: ResizeObserverOptions) => {
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

const createCard = (id: number, title: string, options: { invalid?: boolean } = {}) => {
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

const setupAdapter = (overrides: Partial<BrowseAdapter> = {}) => {
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

describe('createBrowseContentApp', () => {
  it('detects cards, marks hosts processed, and cleans up when nodes are removed', async () => {
    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    const { card: validCard, overlayHost: validHost } = createCard(1, 'Valid Card');
    const { card: invalidCard } = createCard(2, 'Invalid Card', { invalid: true });
    pageContent.append(validCard, invalidCard);

    const { adapter, parseCard, ensureContainer } = setupAdapter();

  hoisted.seriesStatusMap.set(1, createStatusStub());

    const BrowseContentApp = createBrowseContentApp(adapter);
    const { container } = render(<BrowseContentApp />);

    await waitFor(() => {
      const containerNode = validHost.querySelector('.kitsunarr-container');
      expect(containerNode?.querySelector('.kitsunarr-card-overlay')).toBeTruthy();
    });

    expect(parseCard).toHaveBeenCalledWith(validCard);
    expect(ensureContainer).toHaveBeenCalledWith(validHost, validCard);
    expect(adapter.onCardInvalid).toHaveBeenCalledWith(invalidCard);

    expect(validHost.getAttribute('data-kitsunarr-test')).toBe('1');

    const themeRef = useThemeMock.mock.calls[0]?.[0];
    expect(themeRef).toBeDefined();
    await waitFor(() => {
      expect(themeRef?.current).toBe(container.firstChild);
    });

    expect(TooltipWrapperMock).toHaveBeenCalled();
    TooltipWrapperMock.mock.calls.forEach(([props]) => {
      expect(props.container).toBe(document.body);
    });

    expect(mutationObservers.length).toBeGreaterThan(0);

    const { card: directCard, overlayHost: directHost } = createCard(3, 'Direct Card');
  hoisted.seriesStatusMap.set(3, createStatusStub());
    pageContent.appendChild(directCard);

    const triggerObservers = async (records: Partial<MutationRecord>[]) => {
      await act(async () => {
        mutationObservers.forEach(observer => observer.trigger(records));
      });
    };

    await triggerObservers([
      {
        type: 'childList',
        target: pageContent,
        addedNodes: [directCard],
        removedNodes: [],
      } as unknown as MutationRecord,
    ]);

    await waitFor(() => {
      expect(ensureContainer).toHaveBeenCalledWith(directHost, directCard);
      expect(directHost.getAttribute('data-kitsunarr-test')).toBe('3');
    });

    const wrapper = document.createElement('div');
    const { card: rescanCard, overlayHost: rescanHost } = createCard(4, 'Rescan Card');
  hoisted.seriesStatusMap.set(4, createStatusStub());
    wrapper.appendChild(rescanCard);
    pageContent.appendChild(wrapper);

    const parseCallsBeforeRescan = parseCard.mock.calls.length;

    await triggerObservers([
      {
        type: 'childList',
        target: pageContent,
        addedNodes: [wrapper],
        removedNodes: [],
      } as unknown as MutationRecord,
    ]);

    await waitFor(() => {
      expect(parseCard.mock.calls.length).toBeGreaterThan(parseCallsBeforeRescan);
      expect(rescanHost.getAttribute('data-kitsunarr-test')).toBe('4');
    });

    const existingContainer = validHost.querySelector('.kitsunarr-container');
  existingContainer?.remove();

  expect(resizeObservers).toHaveLength(1);
  const ro = resizeObservers[0];
  expect(ro).toBeDefined();
  ro!.trigger();

    await waitFor(() => {
      expect(validHost.hasAttribute('data-kitsunarr-test')).toBe(false);
    });

    pageContent.removeChild(validCard);
    await triggerObservers([
      {
        type: 'childList',
        target: pageContent,
        addedNodes: [],
        removedNodes: [validCard],
      } as unknown as MutationRecord,
    ]);

    await waitFor(() => {
      expect(adapter.onCardInvalid).toHaveBeenCalledWith(validCard);
    });
  });

  it('skips scanning when scan root is unavailable and ignores invalid resize targets', () => {
    const observerRoot = document.createElement('div');
    document.body.appendChild(observerRoot);

    const brokenIterable = {
      [Symbol.iterator]() {
        throw new Error('broken iterable');
      },
    };

    const { adapter, parseCard } = setupAdapter({
      getObserverRoot: () => observerRoot,
      getScanRoot: () => null,
      resizeObserverTargets: () => brokenIterable as unknown as Iterable<Element>,
    });

    const BrowseContentApp = createBrowseContentApp(adapter);
    render(<BrowseContentApp />);

    expect(parseCard).not.toHaveBeenCalled();
    expect(resizeObservers).toHaveLength(0);
    expect(mutationObservers).toHaveLength(1);
    expect(mutationObservers[0]?.observe).toHaveBeenCalled();
  });

  it('retries mapping when status reports missing link and quick add is pressed', async () => {
    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    const { card, overlayHost } = createCard(10, 'Mapping Error');
    pageContent.appendChild(card);

    const { adapter } = setupAdapter();

    const refetch = vi.fn(() => Promise.resolve());
    hoisted.seriesStatusMap.set(
      10,
      createStatusStub({
        data: { anilistTvdbLinkMissing: true },
        refetch,
      }),
    );

    const BrowseContentApp = createBrowseContentApp(adapter);
    render(<BrowseContentApp />);

    const quickButton = await waitFor(() =>
      overlayHost.querySelector<HTMLButtonElement>('button.kitsunarr-card-overlay__quick'),
    );

    expect(quickButton?.getAttribute('aria-label')).toBe('Retry mapping lookup');

    expect(quickButton).not.toBeNull();
    fireEvent.click(quickButton!);

    await waitFor(() => {
      expect(refetch).toHaveBeenCalledWith({ throwOnError: false });
    });
  });

  it('quick adds when defaults are available and opens the modal for advanced options', async () => {
    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    const { card, overlayHost } = createCard(20, 'Addable Card');
    pageContent.appendChild(card);

    const { adapter } = setupAdapter();

  hoisted.seriesStatusMap.set(20, createStatusStub());

  const mutate = vi.fn();
  hoisted.currentAddSeriesResultRef.value = createAddSeriesStub({ mutate });

    const BrowseContentApp = createBrowseContentApp(adapter);
    render(<BrowseContentApp />);

    const quickButton = await waitFor(() =>
      overlayHost.querySelector<HTMLButtonElement>('button.kitsunarr-card-overlay__quick'),
    );
    expect(quickButton?.disabled).toBe(false);

    expect(quickButton).not.toBeNull();
    fireEvent.click(quickButton!);

    expect(mutate).toHaveBeenCalledWith({
      anilistId: 20,
      title: 'Addable Card',
      primaryTitleHint: 'Addable Card',
      metadata: null,
  form: hoisted.publicOptionsResult.data.defaults,
    });

    const gearButton = overlayHost.querySelector<HTMLButtonElement>('button.kitsunarr-card-overlay__gear');
    expect(gearButton).toBeTruthy();
    fireEvent.click(gearButton!);

    const modal = await screen.findByTestId('add-series-modal');
    expect(modal.getAttribute('data-anilist-id')).toBe('20');
    expect(modal.getAttribute('data-title')).toBe('Addable Card');
    expect(modal.getAttribute('data-portal-host')).toBe('present');

    expect(addSeriesModalSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        anilistId: 20,
        title: 'Addable Card',
        metadata: null,
      }),
    );
  });

  it('enters the in-sonarr state when add mutation succeeds', async () => {
    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    const { card, overlayHost } = createCard(30, 'Existing Card');
    pageContent.appendChild(card);

    const { adapter } = setupAdapter();

  hoisted.seriesStatusMap.set(30, createStatusStub());
  hoisted.currentAddSeriesResultRef.value = createAddSeriesStub({ isSuccess: true });

    const BrowseContentApp = createBrowseContentApp(adapter);
    render(<BrowseContentApp />);

    const overlayRoot = await waitFor(() =>
      overlayHost.querySelector<HTMLElement>('.kitsunarr-card-overlay'),
    );

    expect(overlayRoot?.dataset.state).toBe('in-sonarr');
  });

  it('disables overlays when Sonarr configuration is missing', async () => {
    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    const { card, overlayHost } = createCard(40, 'Unconfigured Card');
    pageContent.appendChild(card);

    const { adapter } = setupAdapter();

  hoisted.seriesStatusMap.set(40, createStatusStub());
    hoisted.publicOptionsResult.data = {
      sonarrUrl: '',
      isConfigured: false,
      defaults: null,
    };

    const BrowseContentApp = createBrowseContentApp(adapter);
    render(<BrowseContentApp />);

    const overlayRoot = await waitFor(() =>
      overlayHost.querySelector<HTMLElement>('.kitsunarr-card-overlay'),
    );

    expect(overlayRoot?.dataset.state).toBe('disabled');
  });

  it('handles attribute mutations, rescans when cards disappear, and ignores resize observer errors', async () => {
    document.body.dataset.throwResize = 'true';

    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    const { card, overlayHost } = createCard(50, 'Watched Card');
    pageContent.appendChild(card);

    const { adapter, ensureContainer } = setupAdapter({
      getObserverRoot: () => pageContent,
      getScanRoot: () => pageContent,
    });

    hoisted.seriesStatusMap.set(50, createStatusStub());

    const BrowseContentApp = createBrowseContentApp(adapter);
    render(<BrowseContentApp />);

    await waitFor(() => {
      expect(ensureContainer).toHaveBeenCalledWith(overlayHost, card);
    });

    const ensureCallsBeforeAttribute = ensureContainer.mock.calls.length;

    await act(async () => {
      mutationObservers.forEach(observer =>
        observer.trigger([
          {
            type: 'attributes',
            target: card,
            addedNodes: [] as unknown as NodeListOf<ChildNode>,
            removedNodes: [] as unknown as NodeListOf<ChildNode>,
            attributeName: null as unknown as string,
            attributeNamespace: null as unknown as string,
            previousSibling: null,
            nextSibling: null,
            oldValue: null,
          } as unknown as MutationRecord,
        ]),
      );
    });

    await waitFor(() => {
      expect(ensureContainer.mock.calls.length).toBeGreaterThan(ensureCallsBeforeAttribute);
    });

    const containerNode = overlayHost.querySelector('.kitsunarr-container');
    expect(containerNode).not.toBeNull();

    pageContent.removeChild(card);

    const fragment = document.createDocumentFragment();
    const ghostCard = createCard(99, 'Ghost Card').card;
    fragment.appendChild(ghostCard);

    await act(async () => {
      mutationObservers.forEach(observer =>
        observer.trigger([
          {
            type: 'childList',
            target: pageContent,
            addedNodes: [] as unknown as NodeListOf<ChildNode>,
            removedNodes: [card] as unknown as NodeListOf<ChildNode>,
            attributeName: null as unknown as string,
            attributeNamespace: null as unknown as string,
            previousSibling: null,
            nextSibling: null,
            oldValue: null,
          } as unknown as MutationRecord,
        ]),
      );
    });

    await waitFor(() => {
      expect(adapter.onCardInvalid).toHaveBeenCalledWith(card);
      expect(containerNode?.isConnected).toBe(false);
    });

    delete document.body.dataset.throwResize;
  });

  it('removes fallback containers when card parsing fails', async () => {
    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    const { card: invalidCard, overlayHost } = createCard(60, 'Invalid');
    invalidCard.dataset.invalid = 'true';
    const fallbackContainer = document.createElement('div');
    fallbackContainer.className = 'kitsunarr-container';
    overlayHost.appendChild(fallbackContainer);
    pageContent.appendChild(invalidCard);

    const { adapter } = setupAdapter();

    const BrowseContentApp = createBrowseContentApp(adapter);
    render(<BrowseContentApp />);

    await waitFor(() => {
      expect(adapter.onCardInvalid).toHaveBeenCalledWith(invalidCard);
    });

    expect(fallbackContainer.isConnected).toBe(false);
  });

  it('creates default containers when adapter does not supply one', async () => {
    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    const { card, overlayHost } = createCard(70, 'Fallback Card');
    pageContent.appendChild(card);

    const { adapter } = setupAdapter();
    // Remove ensureContainer to use default implementation
    delete (adapter as Partial<BrowseAdapter>).ensureContainer;

  hoisted.seriesStatusMap.set(70, createStatusStub());

    const BrowseContentApp = createBrowseContentApp(adapter);
    render(<BrowseContentApp />);

    await waitFor(() => {
      expect(overlayHost.querySelector('.kitsunarr-container')).toBeTruthy();
    });
  });
});
