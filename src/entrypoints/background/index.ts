/**
 * @file Main background entrypoint (WXT - Firefox/Chrome MV2/MV3-safe).
 * - Registers unified services
 * - Initializes static mappings on startup and install.
 * - Sets up a periodic alarm to refresh static mappings.
 * - Handles basic browser messages.
 */

import { defineBackground } from 'wxt/utils/define-background';
import browser from 'webextension-polyfill';
import { registerKitsunarrApi, getKitsunarrApi } from '@/services';
import { computeTitleMatchScore } from '@/utils/matching';
import { logger } from '@/utils/logger';

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
const MAPPING_REFRESH_PERIOD_MIN = 360; // 6 hours

const log = logger.create('Background');

export default defineBackground(() => {
  log.info('Background initializing…');

  registerKitsunarrApi();
  log.info('API services registered.');

  const api = getKitsunarrApi();
  const alarmsApi = (browser as unknown as { alarms?: typeof browser.alarms }).alarms;

  const ensurePeriodicRefresh = async (): Promise<void> => {
    if (alarmsApi) {
      const existing = await alarmsApi.get(MAPPING_REFRESH_ALARM);
      if (!existing) {
        alarmsApi.create(MAPPING_REFRESH_ALARM, { periodInMinutes: MAPPING_REFRESH_PERIOD_MIN });
        log.debug(`Alarm created: ${MAPPING_REFRESH_ALARM} every ${MAPPING_REFRESH_PERIOD_MIN}m.`);
      }
      return;
    }

    const key = '__kitsunarr_fallback_interval__';
    if (!(globalThis as Record<string, unknown>)[key]) {
      (globalThis as Record<string, unknown>)[key] = globalThis.setInterval(() => {
        log.debug('Fallback timer → refreshing static mappings');
        void api.mapping.initStaticPairs();
      }, MAPPING_REFRESH_PERIOD_MIN * 60 * 1000);
      log.debug('Using setInterval fallback for periodic refresh.');
    }
  };

  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      log.info('First-time install.');
      browser.runtime.openOptionsPage().catch(() => {});
    }
    // Initialize mappings on first install
    await api.mapping.initStaticPairs();
    await ensurePeriodicRefresh();
  });

  browser.runtime.onStartup.addListener(async () => {
    // Initialize mappings on browser startup
    await api.mapping.initStaticPairs();
    await ensurePeriodicRefresh();
  });

  if (alarmsApi) {
    alarmsApi.onAlarm.addListener((alarm) => {
      if (alarm.name === MAPPING_REFRESH_ALARM) {
        log.debug('Alarm → refreshing static mappings');
        void api.mapping.initStaticPairs();
      }
    });
  }

  browser.runtime.onMessage.addListener(
    (message: unknown): Promise<unknown> | void => {
      if (isOpenOptionsMessage(message)) {
        browser.runtime.openOptionsPage().catch(() => {});
        return;
      }

      if (isMappingRefreshMessage(message)) {
        log.debug('Message → refreshing static mappings');
        void api.mapping.initStaticPairs();
        return Promise.resolve({ ok: true as const });
      }

      if (isScoreBatchMessage(message)) {
        const { queryRaw, startYear, candidates } = message.payload;
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