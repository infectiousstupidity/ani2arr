import { strict as assert } from 'node:assert';
import { access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { exit } from 'node:process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import 'fake-indexeddb/auto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

type StorageChangeListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName: string,
) => void;

type StorageGetArg = undefined | null | string | string[] | Record<string, unknown>;

class MemoryStorageArea {
  private readonly store = new Map<string, unknown>();
  private readonly listeners = new Set<StorageChangeListener>();

  constructor(private readonly areaName: string) {}

  public readonly onChanged = {
    addListener: (listener: StorageChangeListener) => {
      this.listeners.add(listener);
    },
    removeListener: (listener: StorageChangeListener) => {
      this.listeners.delete(listener);
    },
    hasListener: (listener: StorageChangeListener) => this.listeners.has(listener),
  };

  public async get(arg?: StorageGetArg): Promise<Record<string, unknown>> {
    if (arg == null) {
      return Object.fromEntries(this.store.entries());
    }

    if (typeof arg === 'string') {
      return { [arg]: this.store.get(arg) };
    }

    if (Array.isArray(arg)) {
      const result: Record<string, unknown> = {};
      for (const key of arg) {
        result[key] = this.store.get(key);
      }
      return result;
    }

    const result: Record<string, unknown> = {};
    for (const [key, fallback] of Object.entries(arg)) {
      result[key] = this.store.has(key) ? this.store.get(key) : fallback;
    }
    return result;
  }

  public async set(items: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      const oldValue = this.store.get(key);
      this.store.set(key, value);
      this.emitChange(key, oldValue, value);
    }
  }

  public async remove(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
      if (!this.store.has(key)) continue;
      const oldValue = this.store.get(key);
      this.store.delete(key);
      this.emitChange(key, oldValue, undefined);
    }
  }

  public async clear(): Promise<void> {
    const entries = Array.from(this.store.entries());
    this.store.clear();
    for (const [key, oldValue] of entries) {
      this.emitChange(key, oldValue, undefined);
    }
  }

  private emitChange(key: string, oldValue: unknown, newValue: unknown): void {
    if (Object.is(oldValue, newValue)) {
      return;
    }
    const change = { [key]: { oldValue, newValue } };
    for (const listener of this.listeners) {
      listener(change, this.areaName);
    }
  }
}

type MessageListener = (message: unknown, sender: Record<string, unknown>) => unknown;
type AlarmListener = (alarm: { name: string }) => void;

type BackgroundLoadResult = { kind: 'build'; path: string } | { kind: 'source'; moduleId: string };

function createBrowserMock() {
  const localArea = new MemoryStorageArea('local');
  const syncArea = new MemoryStorageArea('sync');

  const messageListeners = new Set<MessageListener>();
  const alarmListeners = new Set<AlarmListener>();

  const alarms = new Map<string, { scheduledTime: number; periodInMinutes?: number }>();
  const grantedOrigins = new Set<string>();

  const runtime = {
    id: 'kitsunarr-contract-test',
    getManifest: () => ({
      manifest_version: 3,
      background: { service_worker: 'background.js' },
    }),
    onMessage: {
      addListener(listener: MessageListener) {
        messageListeners.add(listener);
      },
      removeListener(listener: MessageListener) {
        messageListeners.delete(listener);
      },
      hasListener(listener: MessageListener) {
        return messageListeners.has(listener);
      },
    },
    onInstalled: {
      addListener() {},
      removeListener() {},
    },
    onStartup: {
      addListener() {},
      removeListener() {},
    },
    async sendMessage(message: unknown): Promise<unknown> {
      if (typeof message === 'object' && message !== null) {
        const payload = message as Record<string, unknown>;
        if ('_kitsunarr' in payload && !('type' in payload)) {
          return undefined;
        }
      }

      for (const listener of Array.from(messageListeners)) {
        const result = listener(message, { id: 'contract-script' });
        if (result !== undefined) {
          return await result;
        }
      }
      return undefined;
    },
    async openOptionsPage(): Promise<void> {
      // no-op
    },
  };

  const alarmsApi = {
    async get(name: string) {
      const alarm = alarms.get(name);
      if (!alarm) return undefined;
      return { name, ...alarm };
    },
    create(name: string, info: { when?: number; delayInMinutes?: number; periodInMinutes?: number }) {
      const now = Date.now();
      const scheduledTime =
        info.when ?? (info.delayInMinutes != null ? now + info.delayInMinutes * 60 * 1000 : now);
      alarms.set(name, { scheduledTime, periodInMinutes: info.periodInMinutes });
    },
    clear(name: string) {
      return Promise.resolve(alarms.delete(name));
    },
    clearAll() {
      alarms.clear();
      return Promise.resolve(true);
    },
    onAlarm: {
      addListener(listener: AlarmListener) {
        alarmListeners.add(listener);
      },
      removeListener(listener: AlarmListener) {
        alarmListeners.delete(listener);
      },
    },
  };

  const permissions = {
    async contains(options: { origins?: string[] }): Promise<boolean> {
      if (!options.origins || options.origins.length === 0) return true;
      return options.origins.every(origin => grantedOrigins.has(origin));
    },
    async request(options: { origins?: string[] }): Promise<boolean> {
      if (options.origins) {
        options.origins.forEach(origin => grantedOrigins.add(origin));
      }
      return true;
    },
    async remove(options: { origins?: string[] }): Promise<boolean> {
      if (options.origins) {
        options.origins.forEach(origin => grantedOrigins.delete(origin));
      }
      return true;
    },
  };

  const browser = {
    storage: {
      local: localArea,
      sync: syncArea,
      onChanged: {
        addListener(listener: StorageChangeListener) {
          localArea.onChanged.addListener(listener);
          syncArea.onChanged.addListener(listener);
        },
        removeListener(listener: StorageChangeListener) {
          localArea.onChanged.removeListener(listener);
          syncArea.onChanged.removeListener(listener);
        },
        hasListener(listener: StorageChangeListener) {
          return localArea.onChanged.hasListener(listener) || syncArea.onChanged.hasListener(listener);
        },
      },
    },
    runtime,
    alarms: alarmsApi,
    permissions,
    tabs: {
      async sendMessage() {
        throw new Error('tabs.sendMessage is not implemented in contract test environment.');
      },
    },
  } as const;

  return { browser, grantedOrigins };
}

const { browser, grantedOrigins } = createBrowserMock();
(globalThis as Record<string, unknown>).browser = browser;
(globalThis as Record<string, unknown>).chrome = browser;

type FetchHandler = (request: Request) => Promise<Response>;

function createFetchMock(): void {
  const SONARR_BASE = 'https://sonarr.local';

  const staticMappings: Record<number, number> = {
    1234: 5678,
    9999: 2222,
    4242: 3333,
  };

  const primaryMappingResponse = Object.entries(staticMappings).map(([anilistId, tvdbId]) => ({
    anilist_id: Number(anilistId),
    tvdb_id: tvdbId,
  }));

  const fallbackMappingResponse = Object.entries(staticMappings).map(([anilistId, tvdbId]) => ({
    aniId: Number(anilistId),
    tvdbid: tvdbId,
  }));

  type SonarrSeries = {
    id: number;
    title: string;
    tvdbId: number;
    titleSlug: string;
    year?: number;
    path?: string;
  };

  const seriesList: SonarrSeries[] = [
    { id: 201, title: 'Mapped Series', tvdbId: 5678, titleSlug: 'mapped-series', year: 2020 },
    { id: 202, title: 'Network Series', tvdbId: 2222, titleSlug: 'network-series', year: 2024 },
  ];

  let nextSeriesId = 500;

  const qualityProfiles = [{ id: 1, name: 'HD-1080p' }];
  const rootFolders = [{ id: 10, path: '/media/anime' }];
  const tags = [{ id: 7, label: 'Simulcast' }];

  const handlers: FetchHandler[] = [
    async (request) => {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.href === 'https://raw.githubusercontent.com/eliasbenb/PlexAniBridge-Mappings/v2/mappings.json') {
        return new Response(JSON.stringify(primaryMappingResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ETag: '"primary-v1"' },
        });
      }
      throw new Error('pass');
    },
    async (request) => {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.href === 'https://raw.githubusercontent.com/Kometa-Team/Anime-IDs/master/anime_ids.json') {
        return new Response(JSON.stringify(fallbackMappingResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ETag: '"fallback-v1"' },
        });
      }
      throw new Error('pass');
    },
    async (request) => {
      const url = new URL(request.url);
      if (url.origin === 'https://graphql.anilist.co' && request.method === 'POST') {
        const bodyText = await request.text();
        const payload = JSON.parse(bodyText) as { variables?: { id?: number } };
        const id = payload.variables?.id;
        if (typeof id !== 'number') {
          return new Response(JSON.stringify({ errors: [{ message: 'Invalid id', status: 400 }] }), { status: 400 });
        }
        const media = {
          id,
          format: 'TV',
          title: { english: `Media ${id}`, romaji: `Media ${id}`, native: `メディア${id}` },
          startDate: { year: 2024 },
          synonyms: [`Media ${id}`],
          relations: { edges: [] as Array<{ relationType: string; node: { id: number } }> },
        };
        return new Response(JSON.stringify({ data: { Media: media } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error('pass');
    },
    async (request) => {
      const url = new URL(request.url);
      if (!url.href.startsWith(SONARR_BASE)) {
        throw new Error('pass');
      }

      const path = url.pathname.replace(/\/$/, '');
      const credentialsValid = request.headers.get('X-Api-Key') === '0123456789abcdef0123456789abcdef';
      if (!credentialsValid) {
        return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
      }

      if (request.method === 'GET' && path === '/api/v3/series') {
        if (url.searchParams.has('tvdbId')) {
          const tvdbId = Number(url.searchParams.get('tvdbId'));
          const match = seriesList.filter(series => series.tvdbId === tvdbId);
          return new Response(JSON.stringify(match), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify(seriesList), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (request.method === 'GET' && path === '/api/v3/series/lookup') {
        const term = url.searchParams.get('term') ?? '';
        const decoded = decodeURIComponent(term);
        const matches = seriesList.map(series => ({
          title: series.title,
          tvdbId: series.tvdbId,
          year: series.year,
          titleSlug: series.titleSlug,
        }));
        const createdSeries = {
          title: decoded,
          tvdbId: 3333,
          year: 2023,
          titleSlug: 'added-series',
        };
        return new Response(JSON.stringify([...matches, createdSeries]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (request.method === 'POST' && path === '/api/v3/series') {
        const body = JSON.parse(await request.text()) as Record<string, unknown>;
        const tvdbId = Number(body.tvdbId ?? 0) || 3333;
        const created: SonarrSeries = {
          id: nextSeriesId++,
          title: String(body.title ?? body.seriesTitle ?? 'Created Series'),
          tvdbId,
          titleSlug: body.titleSlug ? String(body.titleSlug) : String(body.title ?? 'created-series').toLowerCase().replace(/\s+/g, '-'),
          year: 2024,
          path: '/media/anime/Created Series',
        };
        seriesList.push(created);
        return new Response(JSON.stringify(created), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (request.method === 'GET' && path === '/api/v3/rootfolder') {
        return new Response(JSON.stringify(rootFolders), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (request.method === 'GET' && path === '/api/v3/qualityprofile') {
        return new Response(JSON.stringify(qualityProfiles), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (request.method === 'GET' && path === '/api/v3/tag') {
        return new Response(JSON.stringify(tags), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (request.method === 'GET' && path === '/api/v3/system/status') {
        return new Response(JSON.stringify({ version: '3.0.0' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unhandled Sonarr request: ${request.method} ${url.href}`);
    },
  ];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    for (const handler of handlers) {
      try {
        const response = await handler(request);
        if (!(response instanceof Response)) {
          throw new Error('Fetch handler must return a Response instance.');
        }
        return response;
      } catch (error) {
        if (error instanceof Error && error.message === 'pass') {
          continue;
        }
        throw error;
      }
    }
    throw new Error(`Unhandled fetch request: ${request.method} ${request.url}`);
  }) as typeof fetch;

  grantedOrigins.add('https://sonarr.local/*');
}

createFetchMock();

type BackgroundModule = {
  default?: unknown;
  main?: () => unknown;
};

async function accessIfExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function searchBackgroundInDirectory(dir: string): Promise<string | null> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isFile() && /background/i.test(entry.name) && /\.(mjs|cjs|js)$/.test(entry.name)) {
        return full;
      }
      if (entry.isDirectory()) {
        const nested = await searchBackgroundInDirectory(full);
        if (nested) return nested;
      }
    }
  } catch {
    // ignore missing directories
  }
  return null;
}

async function resolveBackgroundBundle(): Promise<BackgroundLoadResult> {
  const envPath = process.env.KITSUNARR_BACKGROUND_PATH;
  if (envPath) {
    const candidate = resolve(projectRoot, envPath);
    if (await accessIfExists(candidate)) {
      return { kind: 'build', path: candidate };
    }
  }

  const knownCandidates = [
    join(projectRoot, '.output', 'chrome-mv3', 'background.js'),
    join(projectRoot, '.output', 'chrome-mv3', 'background.mjs'),
    join(projectRoot, '.output', 'chrome-mv3', 'background', 'index.js'),
    join(projectRoot, '.output', 'chrome-mv3', 'background', 'index.mjs'),
    join(projectRoot, 'dist', 'background.js'),
    join(projectRoot, 'dist', 'background.mjs'),
    join(projectRoot, 'dist', 'background', 'index.js'),
    join(projectRoot, 'dist', 'background', 'index.mjs'),
  ];

  for (const candidate of knownCandidates) {
    if (await accessIfExists(candidate)) {
      return { kind: 'build', path: candidate };
    }
  }

  const searchRoots = [join(projectRoot, '.output'), join(projectRoot, 'dist')];
  for (const root of searchRoots) {
    const resolved = await searchBackgroundInDirectory(root);
    if (resolved) {
      return { kind: 'build', path: resolved };
    }
  }

  return { kind: 'source', moduleId: '../src/entrypoints/background/index.ts' };
}

async function runBackgroundModule(mod: BackgroundModule): Promise<void> {
  const candidate = mod.default ?? mod;
  if (candidate && typeof candidate === 'object' && 'main' in candidate && typeof (candidate as { main?: () => unknown }).main === 'function') {
    await (candidate as { main: () => unknown }).main();
    return;
  }
  if (typeof candidate === 'function') {
    await (candidate as () => unknown)();
    return;
  }
  if (typeof mod.main === 'function') {
    await mod.main();
    return;
  }
  throw new Error('Unable to execute background module: missing entry function.');
}

async function loadBackground(): Promise<void> {
  const resolution = await resolveBackgroundBundle();
  if (resolution.kind === 'build') {
    const moduleUrl = pathToFileURL(resolution.path).href;
    const imported = (await import(moduleUrl)) as BackgroundModule;
    await runBackgroundModule(imported);
    console.log(`Loaded background bundle from ${resolution.path}`);
    return;
  }

  const sourceModule = (await import(resolution.moduleId)) as BackgroundModule;
  await runBackgroundModule(sourceModule);
  console.log('Loaded background from source entrypoint.');
}

async function main(): Promise<void> {
  const [{ extensionOptions }, services] = await Promise.all([
    import('../src/utils/storage.ts'),
    import('../src/services/index.ts'),
  ]);

  await loadBackground();

  await extensionOptions.setValue({
    sonarrUrl: 'https://sonarr.local',
    sonarrApiKey: '0123456789abcdef0123456789abcdef',
    defaults: {
      qualityProfileId: 1,
      rootFolderPath: '/media/anime',
      seriesType: 'anime',
      monitorOption: 'all',
      seasonFolder: true,
      searchForMissingEpisodes: true,
      tags: [7],
    },
  });

  const api = services.getKitsunarrApi();

  const steps: string[] = [];
  const record = (label: string) => steps.push(label);

  await api.initMappings();
  record('initMappings');

  const mapping = await api.resolveMapping({ anilistId: 1234 });
  assert.strictEqual(mapping.tvdbId, 5678, 'resolveMapping should return static mapping tvdbId');
  record('resolveMapping');

  const status = await api.getSeriesStatus({ anilistId: 1234 });
  assert.strictEqual(status.exists, true, 'getSeriesStatus should report existing series');
  assert.strictEqual(status.tvdbId, 5678, 'getSeriesStatus should return mapped tvdbId');
  assert.ok(status.series && status.series.titleSlug === 'mapped-series', 'getSeriesStatus should include lean series');
  record('getSeriesStatus');

  const notifyResult = await api.notifySettingsChanged();
  assert.deepStrictEqual(notifyResult, { ok: true }, 'notifySettingsChanged should acknowledge success');
  record('notifySettingsChanged');

  const qualityProfiles = await api.getQualityProfiles();
  assert.ok(Array.isArray(qualityProfiles) && qualityProfiles.length === 1, 'getQualityProfiles should return list');
  assert.strictEqual(qualityProfiles[0]?.name, 'HD-1080p');
  record('getQualityProfiles');

  const rootFolders = await api.getRootFolders();
  assert.ok(Array.isArray(rootFolders) && rootFolders[0]?.path === '/media/anime', 'getRootFolders should include root path');
  record('getRootFolders');

  const tags = await api.getTags();
  assert.ok(Array.isArray(tags) && tags[0]?.label === 'Simulcast', 'getTags should include mocked label');
  record('getTags');

  const connection = await api.testConnection({ url: 'https://sonarr.local', apiKey: '0123456789abcdef0123456789abcdef' });
  assert.strictEqual(connection.version, '3.0.0', 'testConnection should surface version');
  record('testConnection');

  const metadata = await api.getSonarrMetadata();
  assert.strictEqual(metadata.qualityProfiles.length, 1, 'getSonarrMetadata should include quality profiles');
  assert.strictEqual(metadata.rootFolders.length, 1, 'getSonarrMetadata should include root folders');
  assert.strictEqual(metadata.tags.length, 1, 'getSonarrMetadata should include tags');
  record('getSonarrMetadata');

  const added = await api.addToSonarr({
    anilistId: 4242,
    title: 'Created Series',
    form: {
      qualityProfileId: 1,
      rootFolderPath: '/media/anime',
      seriesType: 'anime',
      monitorOption: 'all',
      seasonFolder: true,
      searchForMissingEpisodes: true,
      tags: [7],
    },
  });
  assert.strictEqual(added.tvdbId, 3333, 'addToSonarr should return created series with tvdbId 3333');
  record('addToSonarr');

  const statusAfterAdd = await api.getSeriesStatus({ anilistId: 4242 });
  assert.strictEqual(statusAfterAdd.exists, true, 'getSeriesStatus should detect newly added series');
  assert.strictEqual(statusAfterAdd.tvdbId, 3333, 'getSeriesStatus should use cached tvdbId for new series');
  record('getSeriesStatus(after add)');

  console.log('Kitsunarr contract test passed:', steps.join(' -> '));
}

main()
  .then(() => {
    exit(0);
  })
  .catch(error => {
    console.error('Kitsunarr contract test failed.');
    console.error(error);
    exit(1);
  });
