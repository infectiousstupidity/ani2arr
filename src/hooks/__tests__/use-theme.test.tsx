import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import React, { useRef } from 'react';

import { useTheme } from '../use-theme';

const prefersDarkQuery = '(prefers-color-scheme: dark)';

type MockMutationObserverInstance = {
  callback: MutationCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  trigger: () => void;
};

const createHost = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const container = document.createElement('div');
  shadowRoot.appendChild(container);
  return { host, shadowRoot, container };
};

describe('useTheme', () => {
  const originalLocation = window.location;
  const originalMutationObserver = globalThis.MutationObserver;
  const originalMatchMedia = window.matchMedia;
  let mutationObservers: MockMutationObserverInstance[];

  const TestComponent = () => {
    const ref = useRef<HTMLDivElement | null>(null);
    useTheme(ref);
    return <div ref={ref} data-testid="theme-target" />;
  };

  beforeEach(() => {
    mutationObservers = [];

    class MockMutationObserver implements MutationObserver {
      public readonly observe = vi.fn();
      public readonly disconnect = vi.fn();
      constructor(public readonly callback: MutationCallback) {
        mutationObservers.push({
          callback,
          observe: this.observe,
          disconnect: this.disconnect,
          trigger: () => callback([], this),
        });
      }
      takeRecords(): MutationRecord[] {
        return [];
      }
    }

    Object.defineProperty(globalThis, 'MutationObserver', {
      configurable: true,
      writable: true,
      value: MockMutationObserver,
    });

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    document.body.className = '';
    document.body.removeAttribute('data-theme');
    document.body.innerHTML = '';
    document.body.querySelectorAll('*').forEach(node => node.remove());
    mutationObservers = [];

    Object.defineProperty(globalThis, 'MutationObserver', {
      configurable: true,
      writable: true,
      value: originalMutationObserver,
    });

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('syncs theme based on AniList host classes and responds to mutations', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://anilist.co'),
    });

    document.body.className = 'site-theme-dark';

    const { host, container } = createHost();

    const { container: renderedContainer } = render(<TestComponent />, { container });

    const target = renderedContainer.querySelector('[data-testid="theme-target"]') as HTMLElement;
    expect((target.getRootNode() as ShadowRoot).host).toBe(host);
    expect(host.classList.contains('dark')).toBe(true);

    expect(mutationObservers).toHaveLength(1);
    const observer = mutationObservers[0];
    expect(observer.observe).toHaveBeenCalledWith(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    document.body.className = 'site-theme-default';
    observer.trigger();
    expect(host.classList.contains('dark')).toBe(false);
  });

  it('hooks up matchMedia listeners for AniChart host and cleans up', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://anichart.net'),
    });

    const mediaQueryListeners: { change?: (event: MediaQueryListEvent) => void } = {};
    const mediaQueryList: MediaQueryList = {
      matches: false,
      media: prefersDarkQuery,
      onchange: null,
      addEventListener: vi.fn((event: string, handler: EventListenerOrEventListenerObject) => {
        if (event === 'change') {
          mediaQueryListeners.change = handler as (event: MediaQueryListEvent) => void;
        }
      }),
      removeEventListener: vi.fn(),
      addListener: undefined,
      removeListener: undefined,
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn(() => mediaQueryList),
    });

    document.body.className = 'site-theme-system';

    const { host, container } = createHost();

    const { container: renderedContainer, unmount } = render(<TestComponent />, { container });

    const target = renderedContainer.querySelector('[data-testid="theme-target"]') as HTMLElement;
    expect((target.getRootNode() as ShadowRoot).host).toBe(host);

    expect(host.classList.contains('dark')).toBe(false);

    expect(window.matchMedia).toHaveBeenCalledWith(prefersDarkQuery);
    expect(mediaQueryList.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    mediaQueryList.matches = true;
    mediaQueryListeners.change?.({ matches: true } as MediaQueryListEvent);
    expect(host.classList.contains('dark')).toBe(true);

    expect(mutationObservers).toHaveLength(1);
    const observer = mutationObservers[0];
    expect(observer.observe).toHaveBeenCalledWith(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    unmount();
    expect(observer.disconnect).toHaveBeenCalled();
    expect(mediaQueryList.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
