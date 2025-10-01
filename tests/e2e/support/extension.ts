import { chromium, firefox, type BrowserContext, type Page, type Route, type Worker } from '@playwright/test';
import { mkdtemp, readFile, writeFile, rm, mkdir, cp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const serverBaseUrlEnv = process.env.KITSUNARR_E2E_BASE_URL;
if (!serverBaseUrlEnv) {
  throw new Error('Missing KITSUNARR_E2E_BASE_URL environment variable. Did global setup run?');
}
const serverBaseUrl: string = serverBaseUrlEnv;

export type BackgroundTarget = Page | Worker;

type PermissionShim = {
  request?: (...args: unknown[]) => Promise<boolean>;
  contains?: (...args: unknown[]) => Promise<boolean>;
};

type BrowserShim = {
  permissions?: PermissionShim;
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

type LaunchResult = {
  context: BrowserContext;
  userDataDir: string;
};

async function launchPersistentContext(browserName: string): Promise<LaunchResult> {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'kitsunarr-e2e-'));

  if (browserName === 'chromium') {
    const extensionPath = process.env.KITSUNARR_E2E_CHROMIUM_EXTENSION;
    if (!extensionPath) throw new Error('Missing Chromium extension path');
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
    if (!extensionPath) throw new Error('Missing Firefox extension path');
    await patchManifestHostPermissions(extensionPath);
    await prepareFirefoxProfile(userDataDir, extensionPath);
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
    const connection = (context as unknown as { _browser?: { _connection?: { send?: (method: string, params?: unknown) => Promise<unknown> } } })._browser?._connection;
    if (connection && typeof connection.send === 'function') {
      await connection.send('AddonManager.installTemporaryAddon', { addonPath: extensionPath });
    }
    return { context, userDataDir };
  }

  throw new Error(`Unsupported browser: ${browserName}`);
}

async function prepareFirefoxProfile(userDataDir: string, extensionPath: string): Promise<void> {
  const manifestPath = path.join(extensionPath, 'manifest.json');
  const raw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw) as { browser_specific_settings?: { gecko?: { id?: string } } };
  const geckoId = manifest.browser_specific_settings?.gecko?.id ?? 'kitsunarr@test';
  const extensionsDir = path.join(userDataDir, 'extensions');
  await mkdir(extensionsDir, { recursive: true });
  const targetDir = path.join(extensionsDir, geckoId);
  await rm(targetDir, { recursive: true, force: true });
  await cp(extensionPath, targetDir, { recursive: true });
}

async function patchManifestHostPermissions(extensionPath: string) {
  try {
    const manifestPath = path.join(extensionPath.replace(/\\$/, ''), 'manifest.json');
    const raw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw) as Record<string, unknown>;
    const origin = new URL(serverBaseUrl).origin;
    const hostPattern = `${origin}/*`;
    const existing = Array.isArray(manifest.host_permissions)
      ? (manifest.host_permissions as string[])
      : [];
    if (!existing.includes(hostPattern)) {
      existing.push(hostPattern);
      manifest.host_permissions = existing;
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    }
  } catch (error) {
    console.warn('Could not patch extension manifest for host permissions:', (error as Error).message);
  }
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
  await context.route('https://raw.githubusercontent.com/eliasbenb/PlexAniBridge-Mappings/v2/mappings.json', async route => {
    await proxyRoute(route, `${serverBaseUrl}/mappings/primary`);
  });
  await context.route('https://raw.githubusercontent.com/Kometa-Team/Anime-IDs/master/anime_ids.json', async route => {
    await proxyRoute(route, `${serverBaseUrl}/mappings/fallback`);
  });
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

function attachContextLogging(context: BrowserContext, browserName: string) {
  context.on('page', page => {
    page.on('console', message => {
      console.log(`[${browserName}] page console (${page.url()}): ${message.type()} ${message.text()}`);
    });
    page.on('pageerror', error => {
      console.error(`[${browserName}] page error (${page.url()}):`, error);
    });
  });
  context.on('console', message => {
    console.log(`[${browserName}] context console: ${message.type()} ${message.text()}`);
  });
  context.on('requestfailed', request => {
    const failure = request.failure();
    console.warn(`[${browserName}] request failed: ${request.url()} ${failure?.errorText ?? ''}`.trim());
  });
  context.on('request', request => {
    const url = request.url();
    if (serverBaseUrl && url.startsWith(serverBaseUrl)) {
      console.log(`[${browserName}] request ${request.method()} ${url}`);
    }
  });
  context.on('response', response => {
    const url = response.url();
    if (serverBaseUrl && url.startsWith(serverBaseUrl)) {
      console.log(`[${browserName}] response ${response.status()} ${url}`);
    }
  });
}

async function installBackgroundDiagnostics(background: BackgroundTarget) {
  try {
    await background.evaluate(() => {
      try {
        const g = globalThis as unknown as Record<string, unknown> & { __kitsunarr_e2e_errors?: unknown[] };
        g.__kitsunarr_e2e_errors = g.__kitsunarr_e2e_errors || [];
        const push = (type: string, payload: unknown) => {
          try {
            g.__kitsunarr_e2e_errors!.push({ time: Date.now(), type, payload: String(payload) });
          } catch (pushErr) {
            try { console.warn('[E2E diagnostics push failed]', String(pushErr)); } catch (e) { console.warn(String(e)); }
          }
        };

        try {
          (globalThis as unknown as GlobalEventHandlers).addEventListener?.('error', (ev: unknown) => {
            try {
              const evRec = ev as Record<string, unknown>;
              const msg = (evRec && evRec['message']) ?? ev;
              console.error('[E2E background error]', String(msg));
              push('error', msg);
            } catch (handlerErr) {
              console.warn('[E2E background error handler failed]', String(handlerErr));
            }
          });
          (globalThis as unknown as GlobalEventHandlers).addEventListener?.('unhandledrejection', (ev: unknown) => {
            try {
              const evRec = ev as Record<string, unknown>;
              const reason = (evRec && evRec['reason']) ?? ev;
              console.error('[E2E background unhandledrejection]', String(reason));
              push('unhandledrejection', reason);
            } catch (handlerErr) {
              console.warn('[E2E unhandledrejection handler failed]', String(handlerErr));
            }
          });
        } catch (e) {
          try { console.warn('[E2E diagnostics handlers install failed]', String(e)); } catch (ee) { console.warn(String(ee)); }
        }
      } catch (e) {
        try { console.error('[E2E diagnostics install failed]', String(e)); } catch (ee) { console.warn(String(ee)); }
      }
    });
  } catch (err) {
    console.warn('Could not install background diagnostics collector:', (err as Error).message);
  }
}

async function resolveOptionsUrl(background: BackgroundTarget): Promise<string> {
  let optionsUrl = await background.evaluate(() => {
    const g = globalThis as unknown as {
      browser?: { runtime?: { getURL?: (path: string) => string } };
      chrome?: { runtime?: { getURL?: (path: string) => string } };
      runtime?: { getURL?: (path: string) => string };
    };
    const runtime = g.browser?.runtime || g.chrome?.runtime || g.runtime;
    if (runtime?.getURL) return runtime.getURL('options.html');
    return '';
  });

  if (!optionsUrl) {
    try {
      const bgUrl = (background as BackgroundTarget).url();
      const origin = new URL(bgUrl).origin;
      optionsUrl = `${origin}/options.html`;
    } catch {
      optionsUrl = '';
    }
  }

  return optionsUrl;
}

export function isPageBackground(target: BackgroundTarget): target is Page {
  return typeof (target as Page).bringToFront === 'function';
}

export interface ExtensionHarness {
  context: BrowserContext;
  background: BackgroundTarget;
  optionsUrl: string;
  serverBaseUrl: string;
  browserName: string;
  cleanup(): Promise<void>;
}

export async function createExtensionHarness(browserName: string): Promise<ExtensionHarness> {
  const { context, userDataDir } = await launchPersistentContext(browserName);
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
  const optionsUrl = await resolveOptionsUrl(background);
  if (!optionsUrl) {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
    throw new Error('Failed to resolve extension options page URL.');
  }

  return {
    context,
    background,
    optionsUrl,
    serverBaseUrl,
    browserName,
    async cleanup() {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
    },
  };
}

export async function collectBackgroundDiagnostics(background: BackgroundTarget): Promise<Record<string, unknown>> {
  const diagnostics: Record<string, unknown> = {};
  try {
    const result = await background.evaluate(async () => {
      const out: Record<string, unknown> = {};
      try {
        const globalRecord = globalThis as unknown as Record<string, unknown>;
        out.errors = globalRecord['__kitsunarr_e2e_errors'] ?? [];
      } catch (err) {
        out.errorsError = String(err);
      }

      try {
        const globalRecord = globalThis as unknown as Record<string, unknown>;
        const root =
          (globalRecord['browser'] as Record<string, unknown> | undefined) ??
          (globalRecord['chrome'] as Record<string, unknown> | undefined) ??
          globalRecord;
        const storage = root?.['storage'] as Record<string, unknown> | undefined;
        if (storage && typeof storage['local'] === 'object') {
          try {
            const localObj = storage['local'] as { get?: (this: unknown, keys: unknown) => Promise<unknown> } | undefined;
            const getLocal = localObj?.get;
            if (typeof getLocal === 'function') {
              out.storageLocal = await getLocal.call(localObj, null);
            } else {
              out.storageLocalError = 'storage.local.get not available';
            }
          } catch (err) {
            out.storageLocalError = String(err);
          }
        }
        if (storage && typeof storage['sync'] === 'object') {
          try {
            const syncObj = storage['sync'] as { get?: (this: unknown, keys: unknown) => Promise<unknown> } | undefined;
            const getSync = syncObj?.get;
            if (typeof getSync === 'function') {
              out.storageSync = await getSync.call(syncObj, null);
            } else {
              out.storageSyncError = 'storage.sync.get not available';
            }
          } catch (err) {
            out.storageSyncError = String(err);
          }
        }
      } catch (err) {
        out.storageReadError = String(err);
      }

      return out;
    });
    Object.assign(diagnostics, result);
  } catch (err) {
    diagnostics.evaluateError = String(err);
  }

  try {
    const queryCache = await background.evaluate(async () => {
      const tryRead = (dbName: string, storeName: string, key: string) =>
        new Promise<{ ok: boolean; value?: unknown; error?: string }>(resolve => {
          try {
            const req = indexedDB.open(dbName);
            req.onsuccess = () => {
              try {
                const db = req.result;
                if (!db.objectStoreNames.contains(storeName)) {
                  resolve({ ok: false, error: `store ${storeName} not found` });
                  return;
                }
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const getReq = store.get(key);
                getReq.onsuccess = () => resolve({ ok: true, value: getReq.result });
                getReq.onerror = () => resolve({ ok: false, error: String(getReq.error) });
              } catch (error) {
                resolve({ ok: false, error: String(error) });
              }
            };
            req.onerror = () => resolve({ ok: false, error: String(req.error) });
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
  } catch (err) {
    diagnostics.idbQueryClientCacheError = String(err);
  }

  return diagnostics;
}

export async function readLibraryEpoch(background: BackgroundTarget): Promise<number | undefined> {
  try {
    const result = await background.evaluate(async () => {
      try {
        const globalRecord = globalThis as unknown as Record<string, unknown>;
        const root =
          (globalRecord['browser'] as Record<string, unknown> | undefined) ??
          (globalRecord['chrome'] as Record<string, unknown> | undefined) ??
          globalRecord;
        const storage = root?.['storage'] as Record<string, unknown> | undefined;
        if (storage && typeof storage['local'] === 'object') {
          const localObj = storage['local'] as { get?: (this: unknown, keys: unknown) => Promise<Record<string, unknown>> } | undefined;
          const getFn = localObj?.get;
          if (typeof getFn === 'function') {
            const values = await getFn.call(localObj, ['libraryEpoch']);
            const epoch = (values as Record<string, unknown> | undefined)?.['libraryEpoch'];
            return typeof epoch === 'number' ? epoch : undefined;
          }
        }
      } catch {
        return undefined;
      }
      return undefined;
    });
    return typeof result === 'number' ? result : undefined;
  } catch {
    return undefined;
  }
}

export async function waitForLibraryEpochBump(
  background: BackgroundTarget,
  initialEpoch?: number,
  timeoutMs = 15_000,
): Promise<number | undefined> {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    const current = await readLibraryEpoch(background);
    if (typeof current === 'number' && (initialEpoch === undefined || current > initialEpoch)) {
      return current;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return undefined;
}

export const testServerBaseUrl = serverBaseUrl;
