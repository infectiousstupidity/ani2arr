// src/entrypoints/background/index.ts
import { browser } from 'wxt/browser';
import { registerKitsunarrApi, getKitsunarrApi } from '@/rpc';
import { createApiImplementation } from '@/services';
import { computeTitleMatchScore } from '@/utils/matching';
import { logger } from '@/utils/logger';
import { createMetricsConsoleApi, type MetricsConsoleApi } from '@/utils/metrics';
import { logError, normalizeError } from '@/utils/error-handling';

type OpenOptionsMessage = { type: 'OPEN_OPTIONS_PAGE' };
type MappingRefreshMessage = { type: 'kitsunarr:mapping:refresh' };
type ScoreBatchMessage = {
  type: 'kitsunarr:match:score-batch';
  payload: {
    queryRaw: string;
    startYear?: number;
    candidates: Array<{ title: string; year?: number; genres?: string[] }>;
  };
};

function isScoreBatchMessage(x: unknown): x is ScoreBatchMessage {
  const m = x as Partial<ScoreBatchMessage>;
  return (
    m?.type === 'kitsunarr:match:score-batch' &&
    typeof m.payload?.queryRaw === 'string' &&
    Array.isArray(m.payload?.candidates)
  );
}
function isOpenOptionsMessage(x: unknown): x is OpenOptionsMessage {
  return (x as OpenOptionsMessage)?.type === 'OPEN_OPTIONS_PAGE';
}
function isMappingRefreshMessage(x: unknown): x is MappingRefreshMessage {
  return (x as MappingRefreshMessage)?.type === 'kitsunarr:mapping:refresh';
}

const MAPPING_REFRESH_ALARM = 'kitsunarr:refresh-static-mappings';
const MAPPING_REFRESH_PERIOD_MIN = 360;

const log = logger.create('Background');

export default defineBackground(() => {
  log.info('Background initializing…');

  registerKitsunarrApi(createApiImplementation());
  log.info('API services registered.');

  if (import.meta.env.DEV) {
    const globalWithMetrics = globalThis as typeof globalThis & {
      __kitsunarrMetrics?: MetricsConsoleApi;
    };
    if (!globalWithMetrics.__kitsunarrMetrics) {
      globalWithMetrics.__kitsunarrMetrics = createMetricsConsoleApi();
    }
  }

  const api = getKitsunarrApi();
  const alarmsApi = (browser as unknown as { alarms?: typeof browser.alarms }).alarms;

  const ensurePeriodicRefresh = async (): Promise<void> => {
    if (alarmsApi) {
      const existing = await alarmsApi.get(MAPPING_REFRESH_ALARM);
      if (!existing) {
        alarmsApi.create(MAPPING_REFRESH_ALARM, { periodInMinutes: MAPPING_REFRESH_PERIOD_MIN });
      }
      return;
    }

    const key = '__kitsunarr_fallback_interval__';
    if (!(globalThis as Record<string, unknown>)[key]) {
      (globalThis as Record<string, unknown>)[key] = globalThis.setInterval(() => {
        void api.initMappings().catch(err => {
          logError(normalizeError(err), 'Background:initMappings:interval');
        });
      }, MAPPING_REFRESH_PERIOD_MIN * 60 * 1000);
    }
  };

  browser.runtime.onInstalled.addListener(async (details) => {
    try {
      // Do not automatically open the options page during test runs as the
      // test harness controls navigation and may race with extension startup.
      if (details.reason === 'install' && import.meta.env.MODE !== 'test') {
        browser.runtime.openOptionsPage().catch(() => {});
      }
      await api.initMappings();
      await ensurePeriodicRefresh();
    } catch (error) {
      logError(normalizeError(error), 'Background:onInstalled');
    }
  });

  browser.runtime.onStartup.addListener(async () => {
    try {
      await api.initMappings();
      await ensurePeriodicRefresh();
    } catch (error) {
      logError(normalizeError(error), 'Background:onStartup');
    }
  });

  if (alarmsApi) {
    alarmsApi.onAlarm.addListener((alarm) => {
      if (alarm.name === MAPPING_REFRESH_ALARM) {
        void api.initMappings().catch(err => {
          logError(normalizeError(err), 'Background:initMappings:alarm');
        });
      }
    });
  }

  browser.runtime.onMessage.addListener(
    (message: unknown, sender?: { id?: string }): Promise<unknown> | void => {
      // Only accept messages originating from the extension itself and that
      // explicitly carry the _kitsunarr marker to prevent other origins from
      // invoking privileged background handlers.
      const senderId = (sender as { id?: string } | undefined)?.id;
      const msg = message as { type?: string; timestamp?: number; _kitsunarr?: boolean } | undefined;

      if (senderId !== browser.runtime.id) {
        // Ignore messages from other extensions/origins or no sender info.
        return;
      }

      if (!msg?._kitsunarr) {
        // Marker missing; ignore.
        return;
      }

      // Lightweight readiness probe so content scripts can wait until the
      // background has registered services before issuing RPC calls.
      if (msg.type === 'kitsunarr:ping') {
        return Promise.resolve({ ok: true as const });
      }

      if (isOpenOptionsMessage(msg)) {
        browser.runtime.openOptionsPage().catch(() => {});
        return;
      }

      if (isMappingRefreshMessage(msg)) {
        void api.initMappings();
        return Promise.resolve({ ok: true as const });
      }

      if (isScoreBatchMessage(msg)) {
        const { queryRaw, startYear, candidates } = msg.payload;
        const scores = candidates.map((c) =>
          computeTitleMatchScore({
            queryRaw,
            candidateRaw: c.title,
            ...(typeof c.year === 'number' ? { candidateYear: c.year } : {}),
            ...(typeof startYear === 'number' ? { targetYear: startYear } : {}),
            ...(Array.isArray(c.genres) ? { candidateGenres: c.genres as readonly string[] } : {}),
          }),
        );
        return Promise.resolve({ scores });
      }
    },
  );

  

  log.info('Background setup complete.');
});

