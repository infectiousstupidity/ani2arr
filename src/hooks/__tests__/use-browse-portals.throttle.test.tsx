import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

import { useBrowsePortals, UseBrowsePortalsParams } from '../use-browse-portals';

class MutationObserverMock implements MutationObserver {
  public readonly observe = vi.fn();
  public readonly disconnect = vi.fn();
  constructor(private readonly callback: MutationCallback) {
    MutationObserverMock.instances.push(this);
  }
  takeRecords(): MutationRecord[] {
    return [];
  }
  trigger(records: Partial<MutationRecord>[]) {
    this.callback(records as MutationRecord[], this);
  }
  static instances: MutationObserverMock[] = [];
}

const originalMutationObserver = globalThis.MutationObserver;

describe('useBrowsePortals throttling', () => {
  beforeEach(() => {
    MutationObserverMock.instances = [];
    Object.defineProperty(globalThis, 'MutationObserver', {
      configurable: true,
      writable: true,
      value: MutationObserverMock,
    });
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'MutationObserver', {
      configurable: true,
      writable: true,
      value: originalMutationObserver,
    });
    document.body.innerHTML = '';
  });

  it('coalesces multiple mutation bursts into a small number of full scans', async () => {
    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    document.body.appendChild(pageContent);

    for (let i = 0; i < 3; i++) {
      const c = document.createElement('div');
      c.className = 'media-card';
      pageContent.appendChild(c);
    }

    const origQS = pageContent.querySelectorAll.bind(pageContent);
    const qsSpy = vi.fn((sel: string) => origQS(sel));
    // override for test
    pageContent.querySelectorAll = qsSpy as unknown as typeof pageContent.querySelectorAll;

  const adapter: UseBrowsePortalsParams = {
      cardSelector: '.media-card',
      containerSelector: '.kitsunarr-container',
      parseCard: (_card: Element) => {
        const host = document.createElement('div');
        return { anilistId: 1, title: 't', metadata: null, host };
      },
      ensureContainer: (host: HTMLElement) => {
        let el = host.querySelector<HTMLElement>('.kitsunarr-container');
        if (!el) {
          el = host.ownerDocument.createElement('div');
          el.className = 'kitsunarr-container';
          host.appendChild(el);
        }
        return el;
      },
      getContainerForCard: () => null,
      markProcessed: () => {},
      clearProcessed: () => {},
      getObserverRoot: () => pageContent,
      getScanRoot: () => pageContent,
      getResizeTargets: () => [document.body],
      mutationObserverInit: { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] },
  };

    function TestComp() {
      useBrowsePortals(adapter);
      return null;
    }

    render(<TestComp />);

    // initial mount triggers a full scan
    expect(qsSpy).toHaveBeenCalledTimes(1);

    const wrappers: Element[] = [];
    for (let i = 0; i < 3; i++) {
      const wrapper = document.createElement('div');
      const card = document.createElement('div');
      card.className = 'media-card';
      wrapper.appendChild(card);
      wrappers.push(wrapper);
    }

    await act(async () => {
      MutationObserverMock.instances.forEach(observer => {
        observer.trigger([
          { type: 'childList', target: pageContent, addedNodes: [wrappers[0]], removedNodes: [] } as unknown as MutationRecord,
        ]);
      });
      MutationObserverMock.instances.forEach(observer => {
        observer.trigger([
          { type: 'childList', target: pageContent, addedNodes: [wrappers[1]], removedNodes: [] } as unknown as MutationRecord,
        ]);
      });
      MutationObserverMock.instances.forEach(observer => {
        observer.trigger([
          { type: 'childList', target: pageContent, addedNodes: [wrappers[2]], removedNodes: [] } as unknown as MutationRecord,
        ]);
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Expect at most one additional full-scan beyond mount
    expect(qsSpy.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
