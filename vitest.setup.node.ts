// vitest.setup.node.ts
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { testServer, defaultTestHandlers, resetDefaultTestHandlers } from '@/testing';

beforeAll(() => {
  testServer.use(...defaultTestHandlers);
  testServer.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.useRealTimers();
  resetDefaultTestHandlers();
});

afterAll(() => {
  testServer.close();
});
