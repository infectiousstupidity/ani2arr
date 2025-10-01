import { beforeAll, afterAll, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
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
  class CompatTextEncoder extends NodeTextEncoder {
    encode(input?: Parameters<NodeTextEncoder['encode']>[0]): Uint8Array {
      const result = super.encode(input);
      return result instanceof Uint8Array ? result : new Uint8Array(result);
    }
  }

  const CompatTextDecoder = NodeTextDecoder as unknown as typeof globalThis.TextDecoder;

  Object.defineProperty(globalThis, 'TextEncoder', {
    configurable: true,
    writable: true,
    value: CompatTextEncoder as unknown as typeof globalThis.TextEncoder,
  });

  Object.defineProperty(globalThis, 'TextDecoder', {
    configurable: true,
    writable: true,
    value: CompatTextDecoder,
  });
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
