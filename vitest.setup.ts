// vitest.setup.ts
import { afterEach, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  fakeBrowser.reset();
});
