// src/entrypoints/background/index.ts

/**
 * @file Main background entrypoint (Firefox MV2).
 * - Registers unified services
 * - Periodic static mapping refresh (alarms if available, otherwise setInterval fallback)
 * - Minimal RPC (open options, mapping refresh, score batch)
 */

import { defineBackground } from 'wxt/utils/define-background';
import browser from 'webextension-polyfill';
import { CacheService } from '@/services/cache.service';
import { registerKitsunarrApi, getKitsunarrApi } from '@/services';
import { computeTitleMatchScore } from '@/utils/matching';

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
  return m?.type === 'kitsunarr:match:score-batch'
    && typeof m.payload?.queryRaw === 'string'
    && Array.isArray(m.payload?.candidates);
}
function isOpenOptionsMessage(x: unknown): x is OpenOptionsMessage {
  return (x as OpenOptionsMessage)?.type === 'OPEN_OPTIONS_PAGE';
}
function isMappingRefreshMessage(x: unknown): x is MappingRefreshMessage {
  return (x as MappingRefreshMessage)?.type === 'kitsunarr:mapping:refresh';
}

const STATIC_ALARM = 'kitsunarr:refresh-static-mapping';
const STATIC_REFRESH_PERIOD_MIN = 360; // 6h

export default defineBackground(() => {
  console.log('[Kitsunarr] Background initializing…');

  const cache = new CacheService();
  registerKitsunarrApi(cache);
  console.log('[Kitsunarr] API services registered.');

  const api = getKitsunarrApi();

  // ---- alarms availability (permission may be missing) ----
  const alarmsApi = (browser as unknown as { alarms?: typeof browser.alarms }).alarms;

  const ensurePeriodicRefresh = async (): Promise<void> => {
    if (alarmsApi) {
      const existing = await alarmsApi.get(STATIC_ALARM);
      if (!existing) {
        alarmsApi.create(STATIC_ALARM, { periodInMinutes: STATIC_REFRESH_PERIOD_MIN });
        console.log(`[Kitsunarr] Alarm created: ${STATIC_ALARM} every ${STATIC_REFRESH_PERIOD_MIN}m.`);
      }
      return;
    }
    // Fallback for no "alarms" permission: use setInterval in MV2 persistent background
    const key = '__kitsunarr_fallback_interval__';
    if (!(globalThis as any)[key]) {
      (globalThis as any)[key] = globalThis.setInterval(() => {
        console.log('[Kitsunarr] Fallback timer → refresh static mapping');
        void api.mapping.refreshStaticMapping();
      }, STATIC_REFRESH_PERIOD_MIN * 60 * 1000);
      console.log('[Kitsunarr] Using setInterval fallback for periodic refresh.');
    }
  };

  // First install/open and ensure periodic task
  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      console.log('[Kitsunarr] First-time install.');
      browser.runtime.openOptionsPage().catch(() => {});
      console.log('[Kitsunarr] Pre-fetch static mapping…');
      await api.mapping.refreshStaticMapping();
    }
    await ensurePeriodicRefresh();
  });

  browser.runtime.onStartup.addListener(() => { void ensurePeriodicRefresh(); });

  if (alarmsApi) {
    alarmsApi.onAlarm.addListener((alarm) => {
      if (alarm.name === STATIC_ALARM) {
        console.log('[Kitsunarr] Alarm → refresh static mapping');
        void api.mapping.refreshStaticMapping();
      }
    });
  }

  browser.runtime.onMessage.addListener(
    (message: unknown, _sender: browser.Runtime.MessageSender): Promise<unknown> | void => {
      if (isOpenOptionsMessage(message)) {
        browser.runtime.openOptionsPage().catch(() => {});
        return;
      }

      if (isMappingRefreshMessage(message)) {
        void api.mapping.refreshStaticMapping();
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

      return;
    },
  );

  console.log('[Kitsunarr] Background setup complete.');
});
