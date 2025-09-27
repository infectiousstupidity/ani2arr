import { defineBackground } from 'wxt/utils/define-background';
import browser from 'webextension-polyfill';
import { registerKitsunarrApi, getKitsunarrApi } from '@/services';
import { computeTitleMatchScore } from '@/utils/matching';
import { logger } from '@/utils/logger';
import { extensionOptions } from '@/utils/storage';

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

  registerKitsunarrApi();
  log.info('API services registered.');

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
        void api.initStaticMappings();
      }, MAPPING_REFRESH_PERIOD_MIN * 60 * 1000);
    }
  };

  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      browser.runtime.openOptionsPage().catch(() => {});
    }
    await api.initStaticMappings();
    await ensurePeriodicRefresh();
  });

  browser.runtime.onStartup.addListener(async () => {
    await api.initStaticMappings();
    await ensurePeriodicRefresh();
  });

  if (alarmsApi) {
    alarmsApi.onAlarm.addListener((alarm) => {
      if (alarm.name === MAPPING_REFRESH_ALARM) {
        void api.initStaticMappings();
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
        void api.initStaticMappings();
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

  extensionOptions.watch(async (newValue, oldValue) => {
    const newCredsValid = !!(newValue?.sonarrUrl && newValue?.sonarrApiKey);
    const oldCredsValid = !!(oldValue?.sonarrUrl && oldValue?.sonarrApiKey);

    const credentialsChanged =
      newCredsValid &&
      (!oldCredsValid ||
        newValue.sonarrUrl !== oldValue.sonarrUrl ||
        newValue.sonarrApiKey !== oldValue.sonarrApiKey);

    if (credentialsChanged) {
      log.info('Sonarr credentials changed. Triggering library cache refresh.');
      try {
        await api.refreshLibraryCache(newValue);
        log.info('Library cache refreshed. Notifying content scripts.');
        const tabs = await browser.tabs.query({
          url: ["*://anilist.co/*", "*://anichart.net/*"],
        });
        for (const tab of tabs) {
          if (tab.id) {
            browser.tabs.sendMessage(tab.id, { type: 'KITSUNARR_CONFIG_UPDATED' }).catch(e => {
              log.warn(`Could not message tab ${tab.id}:`, e.message);
            });
          }
        }
      } catch (e) {
        log.error('Failed to refresh library cache after settings change:', e);
      }
    }
  });

  log.info('Background setup complete.');
});