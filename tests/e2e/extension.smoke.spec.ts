import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const absPath = (relative: string): string => {
  return path.resolve(__dirname, '../..', relative);
};

const EXTENSION_PATH = absPath('.output/chrome-mv3');

test.describe('Extension Smoke Tests', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    // Build extension if it doesn't exist
    if (!fs.existsSync(EXTENSION_PATH)) {
      console.log('Extension build not found, running npm run build...');
      execSync('npm run build', { stdio: 'inherit', cwd: absPath('.') });
    }
  });

  test.afterEach(async () => {
    if (context) {
      await context.close();
    }
  });

  test('should inject UI on AniList anime page', async () => {
    // Launch Chromium with extension loaded
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    const page = await context.newPage();

    // Navigate to AniList anime page
    await page.goto('https://anilist.co/anime/1', { waitUntil: 'domcontentloaded' });

    // Wait for the anchor element created by the content script
    const anchor = page.locator('#kitsunarr-actions-anchor');
    await expect(anchor).toBeVisible({ timeout: 30_000 });

    // Wait for the shadow host to be attached
    // The shadow host is created by createShadowRootUi and contains the React app
    const shadowHost = anchor.locator('xpath=.//*[local-name()="kitsunarr-anime-page-ui"]');
    await expect(shadowHost).toBeAttached({ timeout: 30_000 });

    // Verify shadow root exists
    const shadowRoot = await shadowHost.evaluateHandle((el) => el.shadowRoot);
    expect(shadowRoot).toBeTruthy();

    // Check for content inside shadow DOM
    // The ContentRoot component renders a div with SonarrActionGroup
    const shadowContent = shadowHost.locator('xpath=.').first();
    await expect(shadowContent).toBeAttached();

    console.log('✓ Extension UI successfully injected on AniList anime page');
  });
});
