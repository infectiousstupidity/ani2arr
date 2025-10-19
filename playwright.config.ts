// playwright.config.ts
import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = __dirname;

const chromiumExtensionPath = path.resolve(projectRoot, '.output', 'chrome-mv3');
process.env.KITSUNARR_E2E_CHROMIUM_EXTENSION = chromiumExtensionPath;
// Firefox automation is disabled while the E2E harness only supports Chromium.

// Chromium MV3 extensions require a full browser environment. See tests/e2e/README.md for
// instructions on providing a virtual display (for example via xvfb-run) when running in CI.
const headless = false;

export default defineConfig({
  testDir: path.join(projectRoot, 'tests', 'e2e'),
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  fullyParallel: false,
  globalSetup: path.join(projectRoot, 'tests', 'e2e', 'global-setup.ts'),
  use: {
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        headless,
        launchOptions: {
          args: [
            `--disable-extensions-except=${chromiumExtensionPath}`,
            `--load-extension=${chromiumExtensionPath}`,
            '--no-sandbox',
          ],
        },
      },
    },
  ],
});
