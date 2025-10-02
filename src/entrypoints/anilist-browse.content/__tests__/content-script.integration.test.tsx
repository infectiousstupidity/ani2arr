import React from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import type { Root } from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('webextension-polyfill', () => ({
  default: fakeBrowser,
}));

const unsubscribePersistenceMock = vi.fn();
const persistQueryClientMock = vi.fn(() => [unsubscribePersistenceMock, Promise.resolve()]);

vi.mock('@tanstack/query-persist-client-core', () => ({
  persistQueryClient: (...args: Parameters<typeof persistQueryClientMock>) =>
    persistQueryClientMock(...args),
}));

vi.mock('../style.css?inline', () => ({
  default: '.kitsunarr-overlay-container{display:block}',
}));

vi.mock('@/cache/cache-persister', () => ({
  idbQueryCachePersister: {
    persistClient: vi.fn(),
    restoreClient: vi.fn(),
    removeClient: vi.fn(),
  },
}));

const warnMock = vi.fn();

vi.mock('@/utils/logger', () => ({
  logger: {
    create: () => ({
      warn: (...args: Parameters<typeof warnMock>) => warnMock(...args),
      error: vi.fn(),
    }),
  },
}));

const renderedCardLog: Array<{ parsed: { anilistId: number; title: string }; container: HTMLElement }>
  = [];
const invalidCardLog: Element[] = [];
const recordedScanRoots: Array<Element | null> = [];
const recordedObserverRoots: Array<Node | null> = [];
const recordedResizeTargets: Array<Element | Iterable<Element> | null> = [];

vi.mock('@/ui/BrowseOverlay', async () => {
  const actual = await vi.importActual<typeof import('@/ui/BrowseOverlay')>('@/ui/BrowseOverlay');
  return {
    ...actual,
    createBrowseContentApp: (adapter: import('@/ui/BrowseOverlay').BrowseAdapter) => {
      const BrowseApp: React.FC = () => {
        const scanRoot = adapter.getScanRoot ? adapter.getScanRoot() : null;
        recordedScanRoots.push(scanRoot ?? null);
        const observerRoot = adapter.getObserverRoot ? adapter.getObserverRoot() : null;
        recordedObserverRoots.push(observerRoot ?? null);
        const resizeTargets = adapter.resizeObserverTargets ? adapter.resizeObserverTargets() : null;
        recordedResizeTargets.push(resizeTargets ?? null);

        const searchRoot = scanRoot ?? document;
        const cards = Array.from(
          searchRoot?.querySelectorAll?.(adapter.cardSelector) ??
            document.querySelectorAll(adapter.cardSelector),
        );

        const processedAttribute =
          adapter.processedAttribute ?? actual.DEFAULT_PROCESSED_ATTRIBUTE;

        cards.forEach(card => {
          const parsed = adapter.parseCard(card);
          if (!parsed) {
            invalidCardLog.push(card);
            adapter.onCardInvalid?.(card);
            adapter.getContainerForCard?.(card)?.remove();
            return;
          }

          const container = adapter.ensureContainer?.(parsed.host as HTMLElement, card) ?? parsed.host;
          if (adapter.markProcessed) adapter.markProcessed(parsed.host, parsed);
          else if (parsed.host instanceof HTMLElement)
            parsed.host.setAttribute(processedAttribute, String(parsed.anilistId));
          renderedCardLog.push({ parsed, container: container as HTMLElement });
        });

        return null;
      };

      return BrowseApp;
    },
  };
});

const shadowRootInstances: ShadowRoot[] = [];

vi.mock('wxt/utils/content-script-ui/shadow-root', () => ({
  createShadowRootUi: vi.fn(async (_ctx: ContentScriptContext, options) => {
    const host = document.createElement('div');
    host.className = 'kitsunarr-shadow-host';
    const shadow = host.attachShadow({ mode: 'open' });
    shadowRootInstances.push(shadow);
    const container = document.createElement('div');
    shadow.appendChild(container);

    let mountedRoot: Root | null = null;

    return {
      shadowHost: host,
      mount: async () => {
        document.body.appendChild(host);
        mountedRoot = (options.onMount?.(container, shadow) ?? null) as Root | null;
        return mountedRoot;
      },
      remove: () => {
        options.onRemove?.(mountedRoot ?? undefined);
        host.remove();
      },
  } as unknown as import('wxt/utils/content-script-ui/shadow-root').ShadowRootContentScriptUi<Root>;
  }),
}));

type GlobalWithWxt = typeof globalThis & {
  defineContentScript?: <T>(definition: T) => T;
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
    if (this.pattern !== '*://anilist.co/*') return false;
    return /:\/\/anilist\.co\//.test(url);
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

type ContextFactoryResult = { ctx: ContentScriptContext; notifyInvalidated: () => void };

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

const flushAsync = () => new Promise<void>(resolve => setTimeout(resolve, 0));

const setLocationHref = (href: string) => {
  const url = new URL(href);
  const mockLocation: Partial<Location> = {
    href: url.href,
    pathname: url.pathname,
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
    toString: () => url.href,
  };
  Object.defineProperty(window, 'location', {
    configurable: true,
    enumerable: true,
    value: mockLocation,
  });
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    enumerable: true,
    value: window.location,
  });
};

const setupBrowseDom = () => {
  document.body.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'media-card-grid';
  document.body.appendChild(grid);

  const createBaseCard = (anilistId: number) => {
    const card = document.createElement('div');
    card.className = 'media-card';
    card.dataset.anilistId = String(anilistId);
    const cover = document.createElement('a');
    cover.className = 'cover';
    cover.setAttribute('href', `/anime/${anilistId}`);
    card.appendChild(cover);
    const hover = document.createElement('div');
    hover.className = 'hover-data';
    const info = document.createElement('div');
    info.className = 'info';
    const span = document.createElement('span');
    info.appendChild(span);
    hover.appendChild(info);
    card.appendChild(hover);
    grid.appendChild(card);
    return { card, cover, infoSpan: span };
  };

  const card1 = createBaseCard(101);
  card1.infoSpan.textContent = 'TV Show';
  const title1 = document.createElement('div');
  title1.className = 'title';
  const titleLink1 = document.createElement('a');
  titleLink1.textContent = 'Card One Title';
  title1.appendChild(titleLink1);
  card1.card.appendChild(title1);

  const card2 = createBaseCard(202);
  card2.infoSpan.textContent = '';
  Object.assign(card2.card, {
    __vue__: {
      $props: { media: { format: 'ONA' } },
    },
  });
  const title2 = document.createElement('div');
  title2.className = 'title';
  title2.textContent = 'Card Two Title';
  card2.card.appendChild(title2);
  const existingContainer = document.createElement('div');
  existingContainer.className = 'kitsunarr-overlay-container';
  existingContainer.dataset.origin = 'existing';
  card2.cover.appendChild(existingContainer);

  const card3 = createBaseCard(303);
  card3.infoSpan.textContent = 'TV short series';
  card3.cover.setAttribute('title', 'Card Three Title');

  const card4 = createBaseCard(404);
  card4.infoSpan.textContent = 'Special';
  card4.cover.removeAttribute('href');
  card4.cover.setAttribute('href', '/anime/404');
  const img4 = document.createElement('img');
  img4.setAttribute('alt', 'Card Four Title');
  card4.cover.appendChild(img4);

  const card5 = createBaseCard(505);
  card5.infoSpan.textContent = 'Movie';
  card5.cover.setAttribute('data-kitsunarr-processed', 'legacy');
  const strayContainer = document.createElement('div');
  strayContainer.className = 'kitsunarr-overlay-container';
  strayContainer.dataset.card = '505';
  card5.card.appendChild(strayContainer);

  const card6 = createBaseCard(0);
  card6.card.dataset.anilistId = '606';
  card6.cover.setAttribute('href', '/anime/');
  card6.infoSpan.textContent = 'TV';
  card6.cover.setAttribute('data-kitsunarr-processed', 'stale');

  const card7 = document.createElement('div');
  card7.className = 'media-card';
  const hover7 = document.createElement('div');
  hover7.className = 'hover-data';
  const info7 = document.createElement('div');
  info7.className = 'info';
  const span7 = document.createElement('span');
  span7.textContent = 'TV';
  info7.appendChild(span7);
  hover7.appendChild(info7);
  card7.appendChild(hover7);
  grid.appendChild(card7);

  return {
    grid,
    cards: { card1, card2, card3, card4, card5, card6, card7 },
  };
};

beforeEach(() => {
  vi.resetModules();
  renderedCardLog.length = 0;
  invalidCardLog.length = 0;
  recordedScanRoots.length = 0;
  recordedObserverRoots.length = 0;
  recordedResizeTargets.length = 0;
  unsubscribePersistenceMock.mockClear();
  persistQueryClientMock.mockClear();
  warnMock.mockClear();
  shadowRootInstances.length = 0;

  setLocationHref('https://anilist.co/');

  (window as unknown as Record<string, unknown>).defineContentScript = ((definition: unknown) => definition) as unknown as (
    (definition: unknown) => unknown
  );
  g.MatchPattern = TestMatchPattern;
  g.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelectorAll('[data-kitsunarr-browse]').forEach(el => el.remove());
  vi.clearAllMocks();
});

afterAll(() => {
  if (originalDefineContentScript) g.defineContentScript = originalDefineContentScript;
  else delete g.defineContentScript;
  if (originalMatchPattern) g.MatchPattern = originalMatchPattern;
  else delete g.MatchPattern;
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

describe('AniList browse content script integration', () => {
  it('mounts overlays on browse pages and cleans up on invalidation', async () => {
    const { cards } = setupBrowseDom();
    const { ctx, notifyInvalidated } = createTestContext();

    const module = await import('../index');
    expect(module.default.main).toBeInstanceOf(Function);

    await act(async () => {
      await module.default.main?.(ctx);
      await flushAsync();
    });

    const uniqueIds = Array.from(new Set(renderedCardLog.map(entry => entry.parsed.anilistId)));
    expect(uniqueIds).toEqual([101, 202, 303, 404]);
    const uniqueTitles = Array.from(new Set(renderedCardLog.map(entry => entry.parsed.title)));
    expect(uniqueTitles).toEqual([
      'Card One Title',
      'Card Two Title',
      'Card Three Title',
      'Card Four Title',
    ]);

    const cover1 = cards.card1.cover;
    const cover2 = cards.card2.cover;
    const cover3 = cards.card3.cover;
    const cover4 = cards.card4.cover;
    const cover5 = cards.card5.cover;
    const cover6 = cards.card6.cover;

    expect(cover1.querySelectorAll('.kitsunarr-overlay-container')).toHaveLength(1);
    expect(cover2.querySelectorAll('.kitsunarr-overlay-container')).toHaveLength(1);
  expect((cover2.querySelector('.kitsunarr-overlay-container') as HTMLElement)?.dataset.origin).toBe('existing');
    expect(cover3.querySelectorAll('.kitsunarr-overlay-container')).toHaveLength(1);
    expect(cover4.querySelectorAll('.kitsunarr-overlay-container')).toHaveLength(1);

    expect(cover1.getAttribute('data-kitsunarr-processed')).toBe('101');
    expect(cover2.getAttribute('data-kitsunarr-processed')).toBe('202');
    expect(cover3.getAttribute('data-kitsunarr-processed')).toBe('303');
    expect(cover4.getAttribute('data-kitsunarr-processed')).toBe('404');

    expect(cover5.hasAttribute('data-kitsunarr-processed')).toBe(false);
    expect(cover6.hasAttribute('data-kitsunarr-processed')).toBe(false);

    const uniqueInvalidCards = Array.from(new Set(invalidCardLog));
    expect(uniqueInvalidCards).toEqual([cards.card5.card, cards.card6.card, cards.card7]);

    const globalStyle = document.head.querySelector<HTMLStyleElement>('[data-kitsunarr-browse="true"]');
    expect(globalStyle).toBeTruthy();
    expect(globalStyle?.textContent).toContain('kitsunarr-overlay-container');

    const shadowStyle = shadowRootInstances.at(-1)?.querySelector<HTMLStyleElement>(
      '[data-kitsunarr-browse-shadow="true"]',
    );
    expect(shadowStyle).toBeTruthy();

    const shadowHost = document.body.querySelector<HTMLElement>('.kitsunarr-shadow-host');
    expect(shadowHost?.style.zIndex).toBe('2147483647');
    expect(shadowHost?.style.position).toBe('relative');

    await act(async () => {
      notifyInvalidated();
      await flushAsync();
    });

    expect(document.querySelector('.kitsunarr-overlay-container')).toBeNull();
    expect(document.head.querySelector('[data-kitsunarr-browse]')).toBeNull();
    expect(shadowHost?.isConnected).toBe(false);
    expect(unsubscribePersistenceMock).toHaveBeenCalled();
  });

  it('responds to location changes by mounting and removing overlays', async () => {
    const { cards } = setupBrowseDom();
    const { ctx } = createTestContext();

    const module = await import('../index');

    await act(async () => {
      await module.default.main?.(ctx);
      await flushAsync();
    });

    expect(coverHasOverlay(cards.card1.cover)).toBe(true);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('wxt:locationchange', {
          detail: { newUrl: new URL('https://anilist.co/anime/999') },
        }),
      );
      await flushAsync();
    });

    expect(document.querySelector('.kitsunarr-overlay-container')).toBeNull();
    expect(document.head.querySelector('[data-kitsunarr-browse]')).toBeNull();

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('wxt:locationchange', {
          detail: { newUrl: { href: '::::' } },
        }),
      );
      await flushAsync();
    });

    expect(document.querySelector('.kitsunarr-overlay-container')).toBeNull();

    document.body.innerHTML = '';

    const newCardContainer = document.createElement('div');
    newCardContainer.className = 'media-card-grid';
    document.body.appendChild(newCardContainer);
    const newCard = document.createElement('div');
    newCard.className = 'media-card';
    const cover = document.createElement('a');
    cover.className = 'cover';
    cover.setAttribute('href', '/anime/777');
    cover.setAttribute('title', 'Remount Title');
    const hover = document.createElement('div');
    hover.className = 'hover-data';
    const info = document.createElement('div');
    info.className = 'info';
    const span = document.createElement('span');
    span.textContent = 'TV';
    info.appendChild(span);
    hover.appendChild(info);
    newCard.appendChild(cover);
    newCard.appendChild(hover);
    newCardContainer.appendChild(newCard);

    await act(async () => {
      setLocationHref('https://anilist.co/search/anime?search=test');
      window.dispatchEvent(
        new CustomEvent('wxt:locationchange', {
          detail: { newUrl: new URL(window.location.href) },
        }),
      );
      await flushAsync();
    });

    expect(cover.querySelector('.kitsunarr-overlay-container')).toBeTruthy();
    expect(cover.getAttribute('data-kitsunarr-processed')).toBe('777');
  });

  it('skips mounting when not on browse surfaces but still cleans existing artifacts', async () => {
    setLocationHref('https://anilist.co/anime/321');
    document.body.innerHTML = '<div class="kitsunarr-overlay-container"></div>';
    const { ctx } = createTestContext();

    const module = await import('../index');

    await act(async () => {
      await module.default.main?.(ctx);
      await flushAsync();
    });

    expect(renderedCardLog).toHaveLength(0);
    expect(document.querySelector('.kitsunarr-overlay-container')).toBeNull();
  });

  it('logs a warning when query persistence restoration fails', async () => {
    persistQueryClientMock.mockImplementationOnce(() => [
      unsubscribePersistenceMock,
      Promise.reject(new Error('hydrate failed')),
    ]);

    const { ctx } = createTestContext();
    setupBrowseDom();

    const module = await import('../index');

    await act(async () => {
      await module.default.main?.(ctx);
      await flushAsync();
    });

    expect(warnMock).toHaveBeenCalledWith('Failed to hydrate query cache', expect.any(Error));
  });

  it('selects appropriate scan roots for different document structures', async () => {
    const { ctx } = createTestContext();

    const module = await import('../index');

    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    await act(async () => {
      await module.default.main?.(ctx);
      await flushAsync();
    });

    expect(recordedScanRoots.at(-1)).toBe(pageContent);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('wxt:locationchange', {
          detail: { newUrl: new URL('https://anilist.co/anime/9999') },
        }),
      );
      await flushAsync();
    });

    document.body.innerHTML = '';
    const wrapper = document.createElement('section');
    const card = document.createElement('div');
    card.className = 'media-card';
    const cover = document.createElement('a');
    cover.className = 'cover';
    cover.setAttribute('href', '/anime/909');
    const hover = document.createElement('div');
    hover.className = 'hover-data';
    const info = document.createElement('div');
    info.className = 'info';
    const span = document.createElement('span');
    span.textContent = 'TV';
    info.appendChild(span);
    hover.appendChild(info);
    card.appendChild(cover);
    card.appendChild(hover);
    wrapper.appendChild(card);
    document.body.appendChild(wrapper);

    await act(async () => {
      setLocationHref('https://anilist.co/');
      window.dispatchEvent(
        new CustomEvent('wxt:locationchange', {
          detail: { newUrl: new URL(window.location.href) },
        }),
      );
      await flushAsync();
    });

    expect(recordedScanRoots.at(-1)).toBe(wrapper);
    expect(recordedObserverRoots.some(root => root === document.body)).toBe(true);
    expect(recordedResizeTargets.some(target => target !== null)).toBe(true);
  });
});

const coverHasOverlay = (cover: Element): boolean =>
  Boolean(cover.querySelector('.kitsunarr-overlay-container'));

