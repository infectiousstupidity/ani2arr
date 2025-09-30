import 'whatwg-fetch';

import { BatchInterceptor } from '@mswjs/interceptors';
import { FetchInterceptor } from '@mswjs/interceptors/fetch';
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest';
import { cleanup } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

import { defaultTestHandlers, resetDefaultTestHandlers, testServer } from '@/testing';

const globalBrowser = globalThis as typeof globalThis & {
  browser?: typeof fakeBrowser;
  chrome?: typeof fakeBrowser;
};

const interceptor = new BatchInterceptor({
  name: 'kitsunarr-test-interceptor',
  interceptors: [new FetchInterceptor(), new XMLHttpRequestInterceptor()],
});

beforeAll(() => {
  interceptor.apply();
  if (!globalBrowser.browser) {
    globalBrowser.browser = fakeBrowser;
  }
  if (!globalBrowser.chrome) {
    globalBrowser.chrome = fakeBrowser;
  }
  testServer.use(...defaultTestHandlers);
  testServer.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.useRealTimers();
  fakeBrowser.reset();
  fakeBrowser.storage.resetState();
  fakeBrowser.runtime.resetState();
  resetDefaultTestHandlers();
});

afterAll(() => {
  testServer.close();
  interceptor.dispose();
});
