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

interface ServerState {
  sonarrSeries: SonarrSeries[];
  nextSeriesId: number;
  version: string;
}

const createInitialState = (): ServerState => ({
  sonarrSeries: [],
  nextSeriesId: 1000,
  version: '4.0.0',
});

const resetState = (state: ServerState): void => {
  state.sonarrSeries.splice(0, state.sonarrSeries.length);
  state.nextSeriesId = 1000;
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
  http.get('/sonarr/api/v3/system/status', async () => {
    return HttpResponse.json({ version: state.version });
  }),
  http.get('/sonarr/api/v3/series', async ({ request }) => {
    const url = new URL(request.url);
    const tvdbIdParam = url.searchParams.get('tvdbId');
    if (tvdbIdParam) {
      const tvdbId = Number(tvdbIdParam);
      const match = state.sonarrSeries.filter(series => series.tvdbId === tvdbId);
      return HttpResponse.json(match);
    }
    return HttpResponse.json(state.sonarrSeries);
  }),
  http.get('/sonarr/api/v3/series/lookup', async () => {
    return HttpResponse.json([createSonarrLookupFixture()]);
  }),
  http.post('/sonarr/api/v3/series', async ({ request }) => {
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
  http.get('/sonarr/api/v3/rootfolder', async () => {
    return HttpResponse.json([createSonarrRootFolderFixture()]);
  }),
  http.get('/sonarr/api/v3/qualityprofile', async () => {
    return HttpResponse.json([createSonarrQualityProfileFixture()]);
  }),
  http.get('/sonarr/api/v3/tag', async () => {
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
