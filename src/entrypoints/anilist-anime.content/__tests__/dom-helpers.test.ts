import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const persistClientMock = vi.fn();
const restoreClientMock = vi.fn().mockResolvedValue(undefined);
const removeClientMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/cache/cache-persister', () => ({
  idbQueryCachePersister: {
    persistClient: persistClientMock,
    restoreClient: restoreClientMock,
    removeClient: removeClientMock,
  },
}));

type HelpersModule = typeof import('../index');

let waitForElement: HelpersModule['waitForElement'];
let ensureActionsAnchor: HelpersModule['ensureActionsAnchor'];
let startAnchorKeeper: HelpersModule['startAnchorKeeper'];
let ensureSidebarSpacer: HelpersModule['ensureSidebarSpacer'];
let syncSidebarOffset: HelpersModule['syncSidebarOffset'];
let attachSizeSync: HelpersModule['attachSizeSync'];

const ANCHOR_ID = 'kitsunarr-actions-anchor';
const SPACER_ID = 'kitsunarr-actions-spacer';

const originalResizeObserver = globalThis.ResizeObserver;
const resizeObserverInstances: Array<MockResizeObserver> = [];

class MockResizeObserver {
  public observed = new Set<Element>();
  public observe = vi.fn((target: Element) => {
    this.observed.add(target);
  });
  public disconnect = vi.fn();

  constructor(public callback: ResizeObserverCallback) {
    resizeObserverInstances.push(this);
  }

  trigger(target?: Element) {
    const entryTarget: Element | undefined = target ?? this.observed.values().next().value;
    if (entryTarget) {
      const entry: Partial<ResizeObserverEntry> = {
        target: entryTarget,
        contentRect: entryTarget.getBoundingClientRect(),
      };
      // Call the callback with a value matching ResizeObserverEntry[]; cast is safe for tests
      this.callback([entry as ResizeObserverEntry], (this as unknown) as ResizeObserver);
    } else {
      this.callback([], (this as unknown) as ResizeObserver);
    }
  }
}

const getMockResizeObservers = (): MockResizeObserver[] => resizeObserverInstances as MockResizeObserver[];

const createRect = (overrides: Partial<DOMRect> = {}): DOMRect => ({
  width: 0,
  height: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
  ...overrides,
}) as DOMRect;

const setupPageStructure = () => {
  document.body.innerHTML = `
    <div class="header">
      <div class="cover-wrap">
        <div class="actions">
          <button class="favourite"></button>
          <div class="list">List</div>
        </div>
      </div>
    </div>
    <div class="content container">
      <div class="sidebar">
        <div class="rankings">Rankings</div>
      </div>
    </div>
  `;
  const actions = document.querySelector<HTMLElement>('.actions');
  const favourite = document.querySelector<HTMLElement>('.actions .favourite');
  const sidebar = document.querySelector<HTMLElement>('.content.container .sidebar');
  if (!actions || !favourite || !sidebar) {
    throw new Error('Failed to create test DOM structure');
  }
  return { actions, favourite, sidebar };
};

const flushMicrotasks = () => new Promise<void>(resolve => queueMicrotask(() => resolve()));

beforeAll(async () => {
  // Assign the mock ResizeObserver to the global safely
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: MockResizeObserver,
  });
  const module = await import('../index');
  ({
    waitForElement,
    ensureActionsAnchor,
    startAnchorKeeper,
    ensureSidebarSpacer,
    syncSidebarOffset,
    attachSizeSync,
  } = module);
});

afterAll(() => {
  if (originalResizeObserver) {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: originalResizeObserver,
    });
  } else {
    // Remove the mocked property if there wasn't an original
    // Use Reflect.deleteProperty for a safe delete in TS
    Reflect.deleteProperty(globalThis, 'ResizeObserver');
  }
});

beforeEach(() => {
  vi.useFakeTimers();
  resizeObserverInstances.length = 0;
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resizeObserverInstances.length = 0;
  document.body.innerHTML = '';
});

describe('dom helpers', () => {
  describe('waitForElement', () => {
    it('resolves immediately when the selector already exists', async () => {
      const container = document.createElement('div');
      container.className = 'test-root';
      container.innerHTML = '<span class="target"></span>';
      document.body.appendChild(container);

      const element = await waitForElement('.target', container);
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.classList.contains('target')).toBe(true);
    });

    it('waits for future elements via mutation observer', async () => {
      const container = document.createElement('div');
      container.className = 'test-root';
      document.body.appendChild(container);

      const waitPromise = waitForElement('.delayed', container);
      setTimeout(() => {
        const child = document.createElement('span');
        child.className = 'delayed';
        container.appendChild(child);
      }, 10);

      await vi.advanceTimersByTimeAsync(10);
      const element = await waitPromise;
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.classList.contains('delayed')).toBe(true);
    });
  });

  describe('ensureActionsAnchor & startAnchorKeeper', () => {
    it('creates and reuses an anchor with expected styling', () => {
      const { actions } = setupPageStructure();
      const anchor = ensureActionsAnchor();

      expect(anchor).toBeTruthy();
      expect(anchor?.id).toBe(ANCHOR_ID);
      const listRow = actions.querySelector('.list');
      expect(listRow?.previousElementSibling).toBe(anchor);
      expect(anchor?.style.display).toBe('block');
      expect(anchor?.style.gridColumn).toBe('1 / -1');

      const secondCall = ensureActionsAnchor();
      expect(secondCall).toBe(anchor);
      expect(actions.querySelectorAll(`#${ANCHOR_ID}`)).toHaveLength(1);
    });

    it('reinstates the anchor when removed and stops when cleaned up', async () => {
      const { actions } = setupPageStructure();
      const stop = startAnchorKeeper();
      const initialAnchor = actions.querySelector(`#${ANCHOR_ID}`);
      expect(initialAnchor).toBeTruthy();

      initialAnchor?.remove();
      const reattached = await waitForElement(`#${ANCHOR_ID}`, actions);
      expect(reattached).toBeTruthy();
      expect(actions.querySelectorAll(`#${ANCHOR_ID}`)).toHaveLength(1);

      stop();
      actions.querySelector(`#${ANCHOR_ID}`)?.remove();
      await flushMicrotasks();
      expect(actions.querySelector(`#${ANCHOR_ID}`)).toBeNull();
    });
  });

  describe('ensureSidebarSpacer & syncSidebarOffset', () => {
    it('inserts a sidebar spacer before rankings and reuses it', () => {
      const { sidebar } = setupPageStructure();
      const spacer = ensureSidebarSpacer();
      expect(spacer).toBeTruthy();
      expect(spacer?.id).toBe(SPACER_ID);
      expect(sidebar.firstElementChild).toBe(spacer);
      expect(spacer?.style.width).toBe('100%');

      const secondCall = ensureSidebarSpacer();
      expect(secondCall).toBe(spacer);
      expect(sidebar.querySelectorAll(`#${SPACER_ID}`)).toHaveLength(1);
    });

    it('syncs the spacer height with the actions height plus offset', () => {
      const { actions } = setupPageStructure();
      const spacer = ensureSidebarSpacer();
      Object.defineProperty(actions, 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => createRect({ height: 47.6 })),
      });

      syncSidebarOffset(spacer);
      expect(spacer?.style.height).toBe(`${Math.ceil(47.6) + 8}px`);
    });
  });

  describe('attachSizeSync', () => {
    it('syncs css variables, observers, and cleans up correctly', () => {
      const { actions, favourite } = setupPageStructure();
      Object.defineProperty(actions, 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => createRect({ height: 42.5, width: 110 })),
      });
      Object.defineProperty(favourite, 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => createRect({ height: 36, width: 38 })),
      });

      const host = document.createElement('div');
      document.body.appendChild(host);
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const cleanup = attachSizeSync(host);

      expect(host.style.display).toBe('block');
      expect(host.style.position).toBe('static');
      expect(host.style.getPropertyValue('--kitsunarr-fav-size')).toBe('38px');

      const spacer = document.getElementById(SPACER_ID);
      expect(spacer).toBeTruthy();
      expect(spacer?.style.height).toBe(`${Math.ceil(42.5) + 8}px`);

      expect(addSpy).toHaveBeenCalledWith('resize', expect.any(Function));
      const resizeHandler = addSpy.mock.calls.find(call => call[0] === 'resize')?.[1] as EventListener;

      const observers = getMockResizeObservers();
      expect(observers).toHaveLength(3);

      const favObserver = observers.find(observer => observer.observe.mock.calls.some(([target]) => target === favourite));
      expect(favObserver).toBeTruthy();

      Object.defineProperty(favourite, 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => createRect({ height: 52, width: 60 })),
      });
      favObserver?.trigger(favourite);
      expect(host.style.getPropertyValue('--kitsunarr-fav-size')).toBe('60px');

      const actionsObserver = observers.find(observer =>
        observer.observe.mock.calls.some(([target]) => target === actions),
      );
      expect(actionsObserver).toBeTruthy();
      Object.defineProperty(actions, 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => createRect({ height: 55 })),
      });
      actionsObserver?.trigger(actions);
      expect(document.getElementById(SPACER_ID)?.style.height).toBe(`${Math.ceil(55) + 8}px`);

      cleanup();
      observers.forEach(observer => {
        expect(observer.disconnect).toHaveBeenCalled();
      });
      expect(removeSpy).toHaveBeenCalledWith('resize', resizeHandler);
      expect(document.getElementById(SPACER_ID)).toBeNull();
    });
  });
});
