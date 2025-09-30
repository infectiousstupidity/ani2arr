import { beforeAll, afterAll, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { testServer, defaultTestHandlers, resetDefaultTestHandlers } from '@/testing';
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';

type G = typeof globalThis & {
  browser?: typeof fakeBrowser;
  chrome?: typeof fakeBrowser;
};
const g = globalThis as G;

(() => {
  const ok = new NodeTextEncoder().encode('') instanceof Uint8Array;
  if (!ok) {
    Object.defineProperty(globalThis, 'TextEncoder', {
      configurable: true,
      writable: true,
      value: NodeTextEncoder,
    });
    const NodeTD = NodeTextDecoder as unknown as typeof globalThis.TextDecoder;
    Object.defineProperty(globalThis, 'TextDecoder', {
      configurable: true,
      writable: true,
      value: NodeTD,
    });
  }
})();

beforeAll(() => {
  if (!g.browser) g.browser = fakeBrowser;
  if (!g.chrome) g.chrome = fakeBrowser;

  testServer.use(...defaultTestHandlers);
  testServer.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  fakeBrowser.reset();
  fakeBrowser.storage.resetState();
  fakeBrowser.runtime.resetState();
  resetDefaultTestHandlers();
});

afterAll(() => {
  testServer.close();
});
