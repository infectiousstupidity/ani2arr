import { test, expect, chromium, firefox } from '@playwright/test';
import type { BrowserContext, Page, Route, Worker } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { SpawnOptionsWithoutStdio } from 'node:child_process';

const serverBaseUrl = process.env.KITSUNARR_E2E_BASE_URL;

if (!serverBaseUrl) {
  throw new Error('Missing MSW test server base URL. Did global setup run?');
}

const aniListPageHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>AniList Fixture</title>
    <style>
      body { font-family: sans-serif; background: #0f141a; color: #d3e1ec; margin: 0; }
      .header { background: #151f2c; padding: 24px; }
      .cover-wrap { display: grid; grid-template-columns: 240px 1fr; gap: 24px; }
      .actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: center; }
      .actions .favourite { width: 35px; height: 35px; background: #3db4f2; border-radius: 50%; }
      .actions .list { grid-column: 1 / -1; height: 48px; background: rgba(61, 180, 242, 0.12); border-radius: 12px; }
      .content.container { display: flex; gap: 24px; padding: 24px; }
      .content.container .sidebar { width: 280px; min-height: 200px; background: rgba(255,255,255,0.04); border-radius: 12px; padding: 16px; }
      h1 { margin: 0; font-size: 2rem; }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="cover-wrap">
        <div class="poster" style="width:240px;height:340px;background:#22354a;border-radius:12px"></div>
        <div class="info">
          <h1>Kitsunarr Test</h1>
          <div class="actions">
            <div class="favourite" aria-label="Favorite" role="button"></div>
            <div class="list" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="content container">
      <main class="body" style="flex:1">
        <p>Fixture content body.</p>
      </main>
      <aside class="sidebar">
        <div class="rankings">Rankings</div>
      </aside>
    </div>
  </body>
</html>`;

type BackgroundTarget = Page | Worker;

type PermissionShim = {
  request?: (...args: unknown[]) => Promise<boolean>;
  contains?: (...args: unknown[]) => Promise<boolean>;
};

type BrowserShim = {
  permissions?: PermissionShim;
};

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void; reject(reason?: unknown): void };

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function runCommand(command: string, args: string[], options: SpawnOptionsWithoutStdio = {}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) {
        resolve();
      } else {
        const joinedArgs = args.join(' ');
        reject(new Error(`Command failed (${code}): ${command} ${joinedArgs}${stderr ? `\n${stderr}` : ''}`));
      }
    });
  });
}

async function packageFirefoxExtension(extensionDir: string): Promise<{ xpiPath: string; cleanup(): Promise<void> }> {
  const stagingDir = await mkdtemp(path.join(os.tmpdir(), 'kitsunarr-firefox-addon-'));
  const xpiPath = path.join(stagingDir, 'extension.xpi');
  await runCommand('zip', ['-r', xpiPath, '.'], { cwd: extensionDir });
  return {
    xpiPath,
    async cleanup() {
      await rm(stagingDir, { recursive: true, force: true });
    },
  };
}

async function installFirefoxAddon(extensionDir: string, profileDir: string): Promise<void> {
  const { xpiPath, cleanup } = await packageFirefoxExtension(extensionDir);
  try {
    const firefoxExecutable = firefox.executablePath();
    await runCommand(
      firefoxExecutable,
      [
        '-headless',
        '-profile',
        profileDir,
        '-new-instance',
        '-wait-for-browser',
        '-quit',
        '-install-addon',
        xpiPath,
      ],
      {
        env: { ...process.env, MOZ_HEADLESS: '1' },
      },
    );
  } finally {
    await cleanup();
  }
}

async function launchPersistentContext(browserName: string): Promise<{ context: BrowserContext; userDataDir: string }> {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'kitsunarr-e2e-'));
  if (browserName === 'chromium') {
    const extensionPath = process.env.KITSUNARR_E2E_CHROMIUM_EXTENSION;
    if (!extensionPath) throw new Error('Missing Chromium extension path');
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
      ],
    });
    await setupNetworkInterception(context);
    return { context, userDataDir };
  }

  if (browserName === 'firefox') {
    const extensionPath = process.env.KITSUNARR_E2E_FIREFOX_EXTENSION;
    if (!extensionPath) throw new Error('Missing Firefox extension path');
    await installFirefoxAddon(extensionPath, userDataDir);
    const context = await firefox.launchPersistentContext(userDataDir, {
      headless: false,
      firefoxUserPrefs: {
        'extensions.experiments.enabled': true,
        'extensions.install.requireBuiltInCerts': false,
        'extensions.autoDisableScopes': 0,
        'extensions.enabledScopes': 5,
        'xpinstall.signatures.required': false,
      },
    });
    await setupNetworkInterception(context);
    return { context, userDataDir };
  }

  throw new Error(`Unsupported browser: ${browserName}`);
}

async function waitForBackground(context: BrowserContext): Promise<BackgroundTarget> {
  const existingWorker = context.serviceWorkers()[0];
  if (existingWorker) return existingWorker;
  try {
    return await context.waitForEvent('serviceworker', { timeout: 15_000 });
  } catch {
    const existingBackground = context.backgroundPages()[0];
    if (existingBackground) return existingBackground;
    return await context.waitForEvent('backgroundpage', { timeout: 15_000 });
  }
}

async function proxyRoute(route: Route, targetUrl: string) {
  const request = route.request();
  const response = await fetch(targetUrl, {
    method: request.method(),
    headers: request.headers(),
    body: request.postData(),
  });
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const body = await response.text();
  await route.fulfill({
    status: response.status,
    headers,
    body,
  });
}

async function setupNetworkInterception(context: BrowserContext) {
  const gate = createDeferred<void>();
  const interceptors: Array<{ pattern: string; handler: (route: Route) => Promise<void> }> = [
    {
      pattern: 'https://anilist.co/anime/*',
      handler: async route => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: aniListPageHtml,
        });
      },
    },
    {
      pattern: 'https://anilist.co/favicon.ico',
      handler: async route => {
        await route.fulfill({ status: 204 });
      },
    },
    {
      pattern: 'https://graphql.anilist.co/*',
      handler: async route => {
        await proxyRoute(route, `${serverBaseUrl}/anilist/graphql`);
      },
    },
    {
      pattern: 'https://raw.githubusercontent.com/eliasbenb/PlexAniBridge-Mappings/v2/mappings.json',
      handler: async route => {
        await proxyRoute(route, `${serverBaseUrl}/mappings/primary`);
      },
    },
    {
      pattern: 'https://raw.githubusercontent.com/Kometa-Team/Anime-IDs/master/anime_ids.json',
      handler: async route => {
        await proxyRoute(route, `${serverBaseUrl}/mappings/fallback`);
      },
    },
  ];

  await Promise.all(
    interceptors.map(({ pattern, handler }) =>
      context.route(pattern, async route => {
        await gate.promise;
        await handler(route);
      }),
    ),
  );

  gate.resolve();
}

async function resetBackendState() {
  await fetch(`${serverBaseUrl}/__reset`, { method: 'POST' });
}

async function mockPermissions(context: BrowserContext, background: BackgroundTarget) {
  await context.addInitScript(() => {
    const globalBrowser = (globalThis as { browser?: BrowserShim }).browser;
    const permissions = globalBrowser?.permissions;
    if (permissions) {
      permissions.request = async () => true;
      permissions.contains = async () => true;
    }
  });

  await background.evaluate(() => {
    const permissions = (globalThis as { browser?: BrowserShim }).browser?.permissions;
    if (permissions) {
      permissions.request = async () => true;
      permissions.contains = async () => true;
    }
  });
}

test.describe('Kitsunarr extension end-to-end', () => {
  test('configures options and supports quick add flows', async ({ browserName }, testInfo) => {
    const { context, userDataDir } = await launchPersistentContext(browserName);

    try {
      const background = await waitForBackground(context);
      await mockPermissions(context, background);
      const backgroundUrl = background.url?.() ?? '';
      let optionsUrl = '';
      if (backgroundUrl) {
        try {
          optionsUrl = new URL('options/index.html', backgroundUrl).toString();
        } catch {
          optionsUrl = '';
        }
      }
      if (!optionsUrl) {
        throw new Error('Failed to resolve extension options page URL.');
      }

      await resetBackendState();

      const optionsPage = await context.newPage();
      await optionsPage.goto(optionsUrl, { waitUntil: 'networkidle' });

      await expect(optionsPage.getByRole('heading', { name: 'Kitsunarr' })).toBeVisible();

      const sonarrUrlField = optionsPage.getByLabel('Sonarr URL');
      const sonarrApiKeyField = optionsPage.getByLabel('Sonarr API Key');
      await sonarrUrlField.fill(`${serverBaseUrl}/sonarr`);
      await sonarrApiKeyField.fill('0123456789abcdef0123456789abcdef');

      const connectButton = optionsPage.getByRole('button', { name: 'Connect' });
      await connectButton.click();

      const status = optionsPage.getByRole('status');
      await expect(status).toContainText('Connected');
      await expect(optionsPage.getByRole('button', { name: 'Edit' })).toBeEnabled();
      await expect(optionsPage.getByLabel('Quality Profile')).toBeVisible();

      const saveButton = optionsPage.getByRole('button', { name: 'Save settings' });
      await expect(saveButton).toBeEnabled();
      await saveButton.click();
      await expect(saveButton).toBeDisabled({ timeout: 15_000 });

      await testInfo.attach(`options-${browserName}`, {
        body: await optionsPage.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });

      const aniListPage = await context.newPage();
      await aniListPage.goto('https://anilist.co/anime/12345', { waitUntil: 'networkidle' });

      const advancedButton = aniListPage.getByRole('button', { name: 'Advanced options' });
      await advancedButton.waitFor({ state: 'visible' });
      const quickAddButton = advancedButton.locator('xpath=preceding-sibling::button[1]');
      await expect(quickAddButton).toHaveText(/Add to Sonarr|In Sonarr/, { timeout: 20_000 });

      await advancedButton.click();
      const modal = aniListPage.getByRole('dialog');
      await expect(modal).toBeVisible();
      await expect(modal.getByRole('button', { name: 'Add Series' })).toBeVisible();
      await modal.getByRole('button', { name: 'Close' }).click();
      await expect(modal).toBeHidden();

      await quickAddButton.click();
      await expect(quickAddButton).toHaveText('Adding...', { timeout: 5_000 });
      await expect(quickAddButton).toHaveText('In Sonarr', { timeout: 15_000 });

      await testInfo.attach(`anilist-${browserName}`, {
        body: await aniListPage.screenshot({ fullPage: false }),
        contentType: 'image/png',
      });
    } finally {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });
});
