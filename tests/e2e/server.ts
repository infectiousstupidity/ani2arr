// tests/e2e/server.ts
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createMiddleware } from '@mswjs/http-middleware';
import { http, HttpResponse } from 'msw';
import {
  createAniGraphqlSuccessPayload,
  createAniMediaFixture,
  createStaticMappingPayload,
} from '@/testing/fixtures';
import {
  createSonarrLookupFixture,
  createSonarrQualityProfileFixture,
  createSonarrRootFolderFixture,
  createSonarrSeriesFixture,
  createSonarrTagFixture,
} from '@/testing/fixtures/sonarr';
import type { AddRequestPayload, SonarrSeries } from '@/types';

type PendingAddFailure = {
  status: number;
  body?: unknown;
};

interface ServerState {
  sonarrSeries: SonarrSeries[];
  nextSeriesId: number;
  version: string;
  requiredApiKey: string;
  failNextAdd?: PendingAddFailure | undefined;
}

const DEFAULT_SONARR_API_KEY = '0123456789abcdef0123456789abcdef';

const createInitialState = (): ServerState => ({
  sonarrSeries: [],
  nextSeriesId: 1000,
  version: '4.0.0',
  requiredApiKey: DEFAULT_SONARR_API_KEY,
});

const resetState = (state: ServerState): void => {
  const initial = createInitialState();
  state.sonarrSeries.splice(0, state.sonarrSeries.length);
  state.nextSeriesId = initial.nextSeriesId;
  state.version = initial.version;
  state.requiredApiKey = initial.requiredApiKey;
  state.failNextAdd = undefined;
};

const ensureAuthorized = (request: { headers: Headers }, state: ServerState) => {
  if (!state.requiredApiKey) return null;
  const provided = request.headers.get('x-api-key');
  if (provided === state.requiredApiKey) return null;
  return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
};

const createHandlers = (state: ServerState) => [
  http.post('/anilist/graphql', async () => {
    return HttpResponse.json(createAniGraphqlSuccessPayload(createAniMediaFixture()));
  }),
  http.get('/mappings/primary', async () => {
    return HttpResponse.json(createStaticMappingPayload());
  }),
  http.get('/mappings/fallback', async () => {
    return HttpResponse.json(createStaticMappingPayload());
  }),
  http.get('/sonarr/api/v3/system/status', async ({ request }) => {
    const unauthorized = ensureAuthorized(request, state);
    if (unauthorized) return unauthorized;
    return HttpResponse.json({ version: state.version });
  }),
  http.get('/sonarr/api/v3/series', async ({ request }) => {
    const unauthorized = ensureAuthorized(request, state);
    if (unauthorized) return unauthorized;
    const url = new URL(request.url);
    const tvdbIdParam = url.searchParams.get('tvdbId');
    if (tvdbIdParam) {
      const tvdbId = Number(tvdbIdParam);
      const match = state.sonarrSeries.filter(series => series.tvdbId === tvdbId);
      return HttpResponse.json(match);
    }
    return HttpResponse.json(state.sonarrSeries);
  }),
  http.get('/sonarr/api/v3/series/lookup', async ({ request }) => {
    const unauthorized = ensureAuthorized(request, state);
    if (unauthorized) return unauthorized;
    return HttpResponse.json([createSonarrLookupFixture()]);
  }),
  http.post('/sonarr/api/v3/series', async ({ request }) => {
    const unauthorized = ensureAuthorized(request, state);
    if (unauthorized) return unauthorized;
    if (state.failNextAdd) {
      const failure = state.failNextAdd;
      state.failNextAdd = undefined;
      return HttpResponse.json(failure.body ?? { message: 'Forced failure' }, { status: failure.status });
    }
    const payload = (await request.json()) as AddRequestPayload & {
      title?: string;
      tvdbId?: number;
      titleSlug?: string;
    };

    const tvdbId = payload.tvdbId ?? 987654;
    const title = payload.title ?? 'Kitsunarr Test Series';
    const titleSlug = payload.titleSlug ?? 'kitsunarr-test-series';

    const created = createSonarrSeriesFixture({
      id: state.nextSeriesId++,
      tvdbId,
      title,
      titleSlug,
    });

    state.sonarrSeries.push(created);

    return HttpResponse.json(created, { status: 201 });
  }),
  http.get('/sonarr/api/v3/rootfolder', async ({ request }) => {
    const unauthorized = ensureAuthorized(request, state);
    if (unauthorized) return unauthorized;
    return HttpResponse.json([createSonarrRootFolderFixture()]);
  }),
  http.get('/sonarr/api/v3/qualityprofile', async ({ request }) => {
    const unauthorized = ensureAuthorized(request, state);
    if (unauthorized) return unauthorized;
    return HttpResponse.json([createSonarrQualityProfileFixture()]);
  }),
  http.get('/sonarr/api/v3/tag', async ({ request }) => {
    const unauthorized = ensureAuthorized(request, state);
    if (unauthorized) return unauthorized;
    return HttpResponse.json([createSonarrTagFixture()]);
  }),
];

export interface TestServer {
  readonly baseUrl: string;
  close(): Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
  const state = createInitialState();
  const app = express();
  app.use(express.json());

  app.post('/__reset', (_req, res) => {
    resetState(state);
    res.status(204).end();
  });

  app.post('/__state', (req, res) => {
    const patch = req.body as Partial<{
      version: string;
      requiredApiKey: string;
      failNextAdd: PendingAddFailure | null;
    }>;
    if (typeof patch.version === 'string') state.version = patch.version;
    if (typeof patch.requiredApiKey === 'string') state.requiredApiKey = patch.requiredApiKey;
    if ('failNextAdd' in patch) state.failNextAdd = patch.failNextAdd ?? undefined;
    res.status(204).end();
  });

  const middleware = createMiddleware(...createHandlers(state));

  app.use(middleware);

  const server = app.listen(0);

  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', reject);
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
