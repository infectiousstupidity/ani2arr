import {
  chromium,
  firefox,
  type BrowserContext,
  type Page,
  type Route,
  type Worker,
} from '@playwright/test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const serverBaseUrlEnv = process.env.KITSUNARR_E2E_BASE_URL;
if (!serverBaseUrlEnv) {
  throw new Error('Missing KITSUNARR_E2E_BASE_URL environment variable. Did global setup run?');
}

const DEFAULT_TIMEOUT_MS = 15_000;
const serverBaseUrl = serverBaseUrlEnv;

export const testServerBaseUrl = serverBaseUrl;

export type BackgroundTarget = Page | Worker;
type SupportedBrowser = 'chromium' | 'firefox';

type DevToolsConnection = {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
};

type PermissionShim = {
  request?: (permissions: unknown) => Promise<boolean>;
  contains?: (permissions: unknown) => Promise<boolean>;
};

type StorageAreaShim = {
  get?: (keys?: unknown) => Promise<unknown>;
};

type StorageShim = {
  local?: StorageAreaShim;
  sync?: StorageAreaShim;
};

type WebExtRuntime = {
  openOptionsPage?: () => Promise<void>;
  getURL?: (path: string) => string;
};

type WebExtGlobals = {
  browser?: { runtime?: WebExtRuntime; permissions?: PermissionShim; storage?: StorageShim };
  chrome?: { runtime?: WebExtRuntime; permissions?: PermissionShim; storage?: StorageShim };
  runtime?: WebExtRuntime;
  permissions?: PermissionShim;
  storage?: StorageShim;
  __kitsunarr_e2e_errors?: Array<{ time: number; type: string; payload: string }>;
};

type ManifestLike = {
  manifest_version?: number;
  permissions?: Array<string | Record<string, unknown>>;
  host_permissions?: string[];
};

type LaunchResult = {
  context: BrowserContext;
  userDataDir: string;
};

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

async function patchManifestHostPermissions(extensionPath: string): Promise<void> {
  try {
    const manifestPath = path.join(extensionPath, 'manifest.json');
    const raw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw) as ManifestLike;
    const origin = new URL(serverBaseUrl).origin;
    const hostPattern = `${origin}/*`;
    let updated = false;

    const manifestVersion = typeof manifest.manifest_version === 'number' ? manifest.manifest_version : 3;
    if (manifestVersion >= 3) {
      const hostPermissions = Array.isArray(manifest.host_permissions)
        ? [...manifest.host_permissions]
        : [];
      if (!hostPermissions.includes(hostPattern)) {
        hostPermissions.push(hostPattern);
        manifest.host_permissions = hostPermissions;
        updated = true;
      }
    }

    if (manifestVersion < 3) {
      const permissions = Array.isArray(manifest.permissions) ? [...manifest.permissions] : [];
      const hasHostPermission = permissions.some(entry => entry === hostPattern);
      if (!hasHostPermission) {
        permissions.push(hostPattern);
        manifest.permissions = permissions;
        updated = true;
      }
    }

    if (updated) {
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    }
  } catch (error) {
    console.warn('Could not patch extension manifest for host permissions:', (error as Error).message);
  }
}

function getFirefoxDevtoolsConnection(context: BrowserContext): DevToolsConnection | undefined {
  const contextWithConnection = context as unknown as {
    _browser?: { _connection?: DevToolsConnection };
  };
  return contextWithConnection._browser?._connection;
}

async function launchPersistentContext(browserName: SupportedBrowser): Promise<LaunchResult> {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'kitsunarr-e2e-'));

  if (browserName === 'chromium') {
    const extensionPath = process.env.KITSUNARR_E2E_CHROMIUM_EXTENSION;
    if (!extensionPath) {
      throw new Error('Missing Chromium extension path');
    }
    await patchManifestHostPermissions(extensionPath);
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
      ],
    });
    return { context, userDataDir };
  }

  if (browserName === 'firefox') {
    const extensionPath = process.env.KITSUNARR_E2E_FIREFOX_EXTENSION;
    if (!extensionPath) {
      throw new Error('Missing Firefox extension path');
    }
    await patchManifestHostPermissions(extensionPath);
    const context = await firefox.launchPersistentContext(userDataDir, {
      headless: false,
      firefoxUserPrefs: {
        'extensions.experiments.enabled': true,
        'extensions.install.requireBuiltInCerts': false,
        'xpinstall.signatures.required': false,
        'extensions.autoDisableScopes': 0,
        'extensions.enabledScopes': 15,
      },
    });
    const connection = getFirefoxDevtoolsConnection(context);
    if (!connection) {
      throw new Error('Unable to obtain Firefox DevTools connection for temporary addon install');
    }
    await connection.send('AddonManager.installTemporaryAddon', { addonPath: extensionPath });
    return { context, userDataDir };
  }

  throw new Error(`Unsupported browser: ${browserName}`);
}

async function waitForBackground(context: BrowserContext): Promise<BackgroundTarget> {
  const existingWorker = context.serviceWorkers()[0];
  if (existingWorker) {
    return existingWorker;
  }

  const existingBackground = context.backgroundPages()[0];
  if (existingBackground) {
    return existingBackground;
  }

  const worker = await context
    .waitForEvent('serviceworker', { timeout: DEFAULT_TIMEOUT_MS })
    .catch(() => undefined);
  if (worker) {
    return worker;
  }

  const background = await context
    .waitForEvent('backgroundpage', { timeout: DEFAULT_TIMEOUT_MS })
    .catch(() => undefined);
  if (background) {
    return background;
  }

  throw new Error('Timed out waiting for background target to be ready');
}

async function proxyRoute(route: Route, targetUrl: string): Promise<void> {
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

async function setupNetworkInterception(context: BrowserContext): Promise<void> {
  await context.route('https://anilist.co/anime/*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: aniListPageHtml,
    });
  });

  await context.route('https://anilist.co/favicon.ico', async route => {
    await route.fulfill({ status: 204 });
  });

  await context.route('https://graphql.anilist.co/*', async route => {
    await proxyRoute(route, `${serverBaseUrl}/anilist/graphql`);
  });

  await context.route(
    'https://raw.githubusercontent.com/eliasbenb/PlexAniBridge-Mappings/v2/mappings.json',
    async route => {
      await proxyRoute(route, `${serverBaseUrl}/mappings/primary`);
    },
  );

  await context.route(
    'https://raw.githubusercontent.com/Kometa-Team/Anime-IDs/master/anime_ids.json',
    async route => {
      await proxyRoute(route, `${serverBaseUrl}/mappings/fallback`);
    },
  );
}

function attachPageLogging(page: Page, browserName: string): void {
  page.on('console', message => {
    console.log(`[${browserName}] page console (${page.url()}): ${message.type()} ${message.text()}`);
  });
  page.on('pageerror', error => {
    console.error(`[${browserName}] page error (${page.url()}):`, error);
  });
}

function attachContextLogging(context: BrowserContext, browserName: string): void {
  context.pages().forEach(page => attachPageLogging(page, browserName));
  context.on('page', page => {
    attachPageLogging(page, browserName);
  });
  context.on('console', message => {
    console.log(`[${browserName}] context console: ${message.type()} ${message.text()}`);
  });
  context.on('requestfailed', request => {
    const failure = request.failure();
    console.warn(
      `[${browserName}] request failed: ${request.url()} ${failure?.errorText ?? ''}`.trim(),
    );
  });
  context.on('request', request => {
    const url = request.url();
    if (url.startsWith(serverBaseUrl)) {
      console.log(`[${browserName}] request ${request.method()} ${url}`);
    }
  });
  context.on('response', response => {
    const url = response.url();
    if (url.startsWith(serverBaseUrl)) {
      console.log(`[${browserName}] response ${response.status()} ${url}`);
    }
  });
}

async function mockPermissions(context: BrowserContext, background: BackgroundTarget): Promise<void> {
  await context.addInitScript(() => {
    const globalObj = globalThis as unknown as WebExtGlobals;
    const permissions =
      globalObj.browser?.permissions ?? globalObj.chrome?.permissions ?? globalObj.permissions;
    if (permissions) {
      permissions.request = async () => true;
      permissions.contains = async () => true;
    }
  });

  await background.evaluate(() => {
    const globalObj = globalThis as unknown as WebExtGlobals;
    const permissions =
      globalObj.browser?.permissions ?? globalObj.chrome?.permissions ?? globalObj.permissions;
    if (permissions) {
      permissions.request = async () => true;
      permissions.contains = async () => true;
    }
  });
}

async function installBackgroundDiagnostics(background: BackgroundTarget): Promise<void> {
  try {
    await background.evaluate(() => {
      const globalObj = globalThis as unknown as WebExtGlobals;
      if (!Array.isArray(globalObj.__kitsunarr_e2e_errors)) {
        globalObj.__kitsunarr_e2e_errors = [];
      }

      const push = (type: string, payload: unknown) => {
        try {
          globalObj.__kitsunarr_e2e_errors!.push({
            time: Date.now(),
            type,
            payload: String(payload),
          });
        } catch (error) {
          console.warn('[E2E diagnostics push failed]', String(error));
        }
      };

      const handleError = (event: unknown, type: string) => {
        try {
          const record = event as { message?: unknown; reason?: unknown } | undefined;
          const message =
            (record && (type === 'error' ? record.message : record?.reason)) ?? event ?? 'Unknown';
          console.error(`[E2E background ${type}]`, String(message));
          push(type, message);
        } catch (error) {
          console.warn(`[E2E background ${type} handler failed]`, String(error));
        }
      };

      (globalThis as unknown as EventTarget).addEventListener?.('error', event => {
        handleError(event, 'error');
      });

      (globalThis as unknown as EventTarget).addEventListener?.('unhandledrejection', event => {
        handleError(event, 'unhandledrejection');
      });
    });
  } catch (error) {
    console.warn('Could not install background diagnostics collector:', (error as Error).message);
  }
}

function isPageBackground(target: BackgroundTarget): target is Page {
  return typeof (target as Page).bringToFront === 'function';
}

async function invokeRuntimeOpenOptionsPage(background: BackgroundTarget): Promise<void> {
  await background.evaluate(async () => {
    const globalObj = globalThis as unknown as WebExtGlobals;
    const runtime =
      globalObj.browser?.runtime ?? globalObj.chrome?.runtime ?? globalObj.runtime;
    if (!runtime?.openOptionsPage) {
      throw new Error('runtime.openOptionsPage is unavailable in the background context');
    }
    await runtime.openOptionsPage();
  });
}

async function openExtensionOptions(
  context: BrowserContext,
  background: BackgroundTarget,
): Promise<Page> {
  const existing = context.pages().find(page => /options\.html/i.test(page.url()));
  if (existing) {
    await existing.bringToFront();
    await existing.waitForLoadState('domcontentloaded', { timeout: DEFAULT_TIMEOUT_MS });
    return existing;
  }

  const pagePromise = context.waitForEvent('page', { timeout: DEFAULT_TIMEOUT_MS });
  await invokeRuntimeOpenOptionsPage(background);
  const page = await pagePromise;
  await page.waitForURL(/options\.html/i, { timeout: DEFAULT_TIMEOUT_MS });
  await page.waitForLoadState('domcontentloaded', { timeout: DEFAULT_TIMEOUT_MS });
  return page;
}

export interface ExtensionHarness {
  context: BrowserContext;
  background: BackgroundTarget;
  browserName: SupportedBrowser;
  serverBaseUrl: string;
  openOptionsPage(): Promise<Page>;
  waitForTestConnection(): Promise<void>;
  cleanup(): Promise<void>;
}

export async function createExtensionHarness(browserName: string): Promise<ExtensionHarness> {
  if (browserName !== 'chromium' && browserName !== 'firefox') {
    throw new Error(`Unsupported browser for Kitsunarr harness: ${browserName}`);
  }

  const { context, userDataDir } = await launchPersistentContext(browserName);
  context.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
  context.setDefaultNavigationTimeout(DEFAULT_TIMEOUT_MS);
  attachContextLogging(context, browserName);
  await setupNetworkInterception(context);
  const background = await waitForBackground(context);
  if (isPageBackground(background)) {
    background.on('console', message => {
      console.log(`[${browserName}] background console: ${message.type()} ${message.text()}`);
    });
    background.on('pageerror', error => {
      console.error(`[${browserName}] background error:`, error);
    });
  }
  await mockPermissions(context, background);
  await installBackgroundDiagnostics(background);

  return {
    context,
    background,
    browserName,
    serverBaseUrl,
    async openOptionsPage() {
      return openExtensionOptions(context, background);
    },
    async waitForTestConnection() {
      const targetUrl = `${serverBaseUrl}/sonarr/api/v3/system/status`;
      const response = await context.waitForEvent('response', {
        timeout: DEFAULT_TIMEOUT_MS,
        predicate: candidate =>
          candidate.url() === targetUrl && candidate.request().method() === 'GET',
      });
      if (!response.ok()) {
        throw new Error(
          `Sonarr status request failed: ${response.status()} ${response.statusText()}`,
        );
      }
    },
    async cleanup() {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
    },
  };
}

export async function collectBackgroundDiagnostics(
  background: BackgroundTarget,
): Promise<Record<string, unknown>> {
  const diagnostics: Record<string, unknown> = {};
  try {
    const result = await background.evaluate(async () => {
      const output: Record<string, unknown> = {};
      const globalObj = globalThis as unknown as WebExtGlobals;
      output.errors = globalObj.__kitsunarr_e2e_errors ?? [];

      const storage =
        globalObj.browser?.storage ?? globalObj.chrome?.storage ?? globalObj.storage;
      if (storage?.local?.get) {
        try {
          output.storageLocal = await storage.local.get();
        } catch (error) {
          output.storageLocalError = String(error);
        }
      }
      if (storage?.sync?.get) {
        try {
          output.storageSync = await storage.sync.get();
        } catch (error) {
          output.storageSyncError = String(error);
        }
      }

      return output;
    });
    Object.assign(diagnostics, result);
  } catch (error) {
    diagnostics.evaluateError = String(error);
  }

  try {
    const queryCache = await background.evaluate(async () => {
      const tryRead = (dbName: string, storeName: string, key: string) =>
        new Promise<{ ok: boolean; value?: unknown; error?: string }>(resolve => {
          try {
            const request = indexedDB.open(dbName);
            request.onsuccess = () => {
              try {
                const db = request.result;
                if (!db.objectStoreNames.contains(storeName)) {
                  resolve({ ok: false, error: `store ${storeName} not found` });
                  return;
                }
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const getRequest = store.get(key);
                getRequest.onsuccess = () => resolve({ ok: true, value: getRequest.result });
                getRequest.onerror = () => resolve({ ok: false, error: String(getRequest.error) });
              } catch (error) {
                resolve({ ok: false, error: String(error) });
              }
            };
            request.onerror = () => resolve({ ok: false, error: String(request.error) });
          } catch (error) {
            resolve({ ok: false, error: String(error) });
          }
        });

      const candidates = [
        { db: 'keyval-store', store: 'keyval' },
        { db: 'keyval', store: 'keyval' },
      ];

      for (const candidate of candidates) {
        const result = await tryRead(candidate.db, candidate.store, 'kitsunarr-query-client-cache');
        if (result.ok) {
          return { ok: true, db: candidate.db, store: candidate.store, value: result.value } as const;
        }
      }

      return { ok: false, error: 'not found in known stores' } as const;
    });
    diagnostics.idbQueryClientCache = queryCache;
  } catch (error) {
    diagnostics.idbQueryClientCacheError = String(error);
  }

  return diagnostics;
}

export async function readLibraryEpoch(background: BackgroundTarget): Promise<number | undefined> {
  try {
    const result = await background.evaluate(async () => {
      try {
        const globalObj = globalThis as unknown as WebExtGlobals;
        const storage =
          globalObj.browser?.storage ?? globalObj.chrome?.storage ?? globalObj.storage;
        const localGet = storage?.local?.get;
        if (typeof localGet === 'function') {
          const values = (await localGet.call(storage.local, ['libraryEpoch'])) as
            | Record<string, unknown>
            | undefined;
          const epoch = values?.libraryEpoch;
          return typeof epoch === 'number' ? epoch : undefined;
        }
        return undefined;
      } catch (error) {
        console.warn('Failed to read libraryEpoch from storage.local:', String(error));
        return undefined;
      }
    });
    return typeof result === 'number' ? result : undefined;
  } catch (error) {
    console.warn('Background evaluation failed while reading libraryEpoch:', String(error));
    return undefined;
  }
}

export async function waitForLibraryEpochBump(
  background: BackgroundTarget,
  initialEpoch?: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<number | undefined> {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    const current = await readLibraryEpoch(background);
    if (typeof current === 'number' && (initialEpoch === undefined || current > initialEpoch)) {
      return current;
    }
    await new Promise(resolve => {
      setTimeout(resolve, 250);
    });
  }
  return undefined;
}
