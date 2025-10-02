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
const recordedMutationObserverInit: MutationObserverInit[] = [];

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
        if (adapter.mutationObserverInit) recordedMutationObserverInit.push(adapter.mutationObserverInit);

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
    if (this.pattern !== '*://anichart.net/*' && this.pattern !== '*://www.anichart.net/*') return false;
    return /:\/\/([w]{3}\.)?anichart\.net\//.test(url);
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

const setupAniChartDom = () => {
  document.body.innerHTML = '';
  const wrapper = document.createElement('main');
  wrapper.className = 'content';
  document.body.appendChild(wrapper);

  const createSection = (headingText: string) => {
    const section = document.createElement('section');
    const heading = document.createElement('h2');
    heading.textContent = headingText;
    section.appendChild(heading);
    wrapper.appendChild(section);
    return section;
  };

  const createCard = (section: HTMLElement, anilistId: number, title: string) => {
    const card = document.createElement('div');
    card.className = 'media-card';
    const cover = document.createElement('a');
    cover.className = 'cover';
    cover.setAttribute('href', `https://anilist.co/anime/${anilistId}`);
    card.appendChild(cover);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    const overlayTitle = document.createElement('div');
    overlayTitle.className = 'title';
    overlayTitle.textContent = title;
    overlay.appendChild(overlayTitle);
    card.appendChild(overlay);

    const data = document.createElement('div');
    data.className = 'data';
    const header = document.createElement('div');
    header.className = 'header';
    const fallbackTitle = document.createElement('div');
    fallbackTitle.className = 'title';
    fallbackTitle.textContent = title;
    header.appendChild(fallbackTitle);
    data.appendChild(header);
    card.appendChild(data);

    section.appendChild(card);
    return { card, cover };
  };

  const tvSection = createSection('Spring TV Highlights');
  const tvCard1 = createCard(tvSection, 111, 'First Show');
  const tvCard2 = createCard(tvSection, 222, 'Second Show');
  const existingContainer = document.createElement('div');
  existingContainer.className = 'kitsunarr-overlay-container';
  existingContainer.dataset.origin = 'existing';
  tvCard2.cover.appendChild(existingContainer);

  const tvCardInvalidId = createCard(tvSection, Number.NaN, 'Broken Show');
  tvCardInvalidId.cover.setAttribute('href', 'https://anilist.co/anime/not-a-number');
  tvCardInvalidId.cover.setAttribute('data-kitsunarr-processed', 'stale');

  const tvCardNoTitle = createCard(tvSection, 333, '');
  tvCardNoTitle.cover.setAttribute('title', '');
  tvCardNoTitle.cover.removeAttribute('href');
  tvCardNoTitle.card.querySelector('.overlay .title')!.textContent = '';
  tvCardNoTitle.card.querySelector('.data .header .title')!.textContent = '';
  const img = document.createElement('img');
  img.setAttribute('alt', '');
  tvCardNoTitle.cover.appendChild(img);

  const movieSection = createSection('Movie Premieres');
  createCard(movieSection, 444, 'Movie Entry');

  const musicSection = createSection('Music Specials');
  createCard(musicSection, 555, 'Music Entry');

  const strayContainer = document.createElement('div');
  strayContainer.className = 'kitsunarr-overlay-container';
  strayContainer.dataset.detached = 'true';
  document.body.appendChild(strayContainer);

  return {
    tvCard1,
    tvCard2,
    tvCardInvalidId,
    tvCardNoTitle,
    sections: { tvSection, movieSection, musicSection },
    strayContainer,
  };
};

beforeEach(() => {
  vi.resetModules();
  renderedCardLog.length = 0;
  invalidCardLog.length = 0;
  recordedScanRoots.length = 0;
  recordedObserverRoots.length = 0;
  recordedResizeTargets.length = 0;
  recordedMutationObserverInit.length = 0;
  unsubscribePersistenceMock.mockClear();
  persistQueryClientMock.mockClear();
  warnMock.mockClear();
  shadowRootInstances.length = 0;

  setLocationHref('https://anichart.net/spring');

  (window as unknown as Record<string, unknown>).defineContentScript = ((definition: unknown) => definition) as unknown as (
    (definition: unknown) => unknown
  );
  g.MatchPattern = TestMatchPattern;
  g.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelectorAll('[data-kitsunarr-anichart]').forEach(el => el.remove());
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

describe('AniChart browse content script integration', () => {
  it('mounts overlays on AniChart surfaces and cleans up on invalidation', async () => {
    const dom = setupAniChartDom();
    const { ctx, notifyInvalidated } = createTestContext();

    const module = await import('../index');
    expect(module.default.main).toBeInstanceOf(Function);

    await act(async () => {
      await module.default.main?.(ctx);
      await flushAsync();
    });

    const uniqueIds = Array.from(new Set(renderedCardLog.map(entry => entry.parsed.anilistId)));
    expect(uniqueIds).toEqual([111, 222]);
    const uniqueTitles = Array.from(new Set(renderedCardLog.map(entry => entry.parsed.title)));
    expect(uniqueTitles).toEqual(['First Show', 'Second Show']);

    expect(dom.tvCard1.cover.querySelectorAll('.kitsunarr-overlay-container')).toHaveLength(1);
    expect(dom.tvCard2.cover.querySelectorAll('.kitsunarr-overlay-container')).toHaveLength(1);
  expect((dom.tvCard2.cover.querySelector('.kitsunarr-overlay-container') as HTMLElement)?.dataset.origin).toBe('existing');

    expect(dom.tvCard1.cover.getAttribute('data-kitsunarr-processed')).toBe('111');
    expect(dom.tvCard2.cover.getAttribute('data-kitsunarr-processed')).toBe('222');

    expect(dom.tvCardInvalidId.cover.hasAttribute('data-kitsunarr-processed')).toBe(false);
    expect(dom.tvCardNoTitle.cover.hasAttribute('data-kitsunarr-processed')).toBe(false);

    const uniqueInvalidCards = Array.from(new Set(invalidCardLog));
    expect(uniqueInvalidCards).toEqual([
      dom.tvCardInvalidId.card,
      dom.tvCardNoTitle.card,
      dom.sections.movieSection.querySelector('.media-card')!,
      dom.sections.musicSection.querySelector('.media-card')!,
    ]);

    const globalStyle = document.head.querySelector<HTMLStyleElement>('[data-kitsunarr-anichart="true"]');
    expect(globalStyle).toBeTruthy();
    expect(globalStyle?.textContent).toContain('kitsunarr-overlay-container');

    const shadowStyle = shadowRootInstances.at(-1)?.querySelector<HTMLStyleElement>(
      '[data-kitsunarr-anichart-shadow="true"]',
    );
    expect(shadowStyle).toBeTruthy();

    const shadowHost = document.body.querySelector<HTMLElement>('.kitsunarr-shadow-host');
    expect(shadowHost?.style.zIndex).toBe('2147483647');
    expect(shadowHost?.style.position).toBe('relative');

    expect(recordedScanRoots.at(-1)).toBe(document.body);
    expect(recordedObserverRoots.at(-1)).toBe(document.body);
    expect(recordedResizeTargets.at(-1)).toEqual([document.body]);
    expect(recordedMutationObserverInit.at(-1)).toMatchObject({ childList: true, subtree: true });

    await act(async () => {
      notifyInvalidated();
      await flushAsync();
    });

    expect(document.querySelector('.kitsunarr-overlay-container')).toBeNull();
    expect(document.head.querySelector('[data-kitsunarr-anichart]')).toBeNull();
    expect(shadowHost?.isConnected).toBe(false);
    expect(unsubscribePersistenceMock).toHaveBeenCalled();
  });

  it('responds to location changes by mounting and removing overlays', async () => {
    const dom = setupAniChartDom();
    const { ctx } = createTestContext();

    const module = await import('../index');

    await act(async () => {
      await module.default.main?.(ctx);
      await flushAsync();
    });

    expect(dom.tvCard1.cover.querySelector('.kitsunarr-overlay-container')).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('wxt:locationchange', {
          detail: { newUrl: new URL('https://example.com/elsewhere') },
        }),
      );
      await flushAsync();
    });

    expect(document.querySelector('.kitsunarr-overlay-container')).toBeNull();
    expect(document.head.querySelector('[data-kitsunarr-anichart]')).toBeNull();

    setupAniChartDom();
    await act(async () => {
      setLocationHref('https://www.anichart.net/fall');
      window.dispatchEvent(
        new CustomEvent('wxt:locationchange', {
          detail: { newUrl: new URL(window.location.href) },
        }),
      );
      await flushAsync();
    });

    const latestShadow = shadowRootInstances.at(-1);
    expect(latestShadow?.querySelector('[data-kitsunarr-anichart-shadow="true"]')).toBeTruthy();
  });

  it('skips mounting when not on AniChart surfaces but still cleans existing artifacts', async () => {
    setLocationHref('https://anilist.co/anime/321');
    document.body.innerHTML = `
      <a class="cover" data-kitsunarr-processed="legacy">
        <div class="kitsunarr-overlay-container"></div>
      </a>
    `;
    const globalStyle = document.createElement('style');
    globalStyle.setAttribute('data-kitsunarr-anichart', 'true');
    document.head.appendChild(globalStyle);

    const { ctx } = createTestContext();

    const module = await import('../index');

    await act(async () => {
      await module.default.main?.(ctx);
      await flushAsync();
    });

    expect(renderedCardLog).toHaveLength(0);
    expect(document.querySelector('.kitsunarr-overlay-container')).toBeNull();
    expect(document.querySelector('[data-kitsunarr-processed]')).toBeNull();
    expect(document.head.querySelectorAll('[data-kitsunarr-anichart]')).toHaveLength(1);
    expect(document.head.contains(globalStyle)).toBe(true);
  });

  it('logs a warning when query persistence restoration fails', async () => {
    persistQueryClientMock.mockImplementationOnce(() => [
      unsubscribePersistenceMock,
      Promise.reject(new Error('hydrate failed')),
    ]);

    const { ctx } = createTestContext();
    setupAniChartDom();

    const module = await import('../index');

    await act(async () => {
      await module.default.main?.(ctx);
      await flushAsync();
    });

    expect(warnMock).toHaveBeenCalledWith('Failed to hydrate query cache', expect.any(Error));
  });
});
