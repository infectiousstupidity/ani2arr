/** Background lifecycle listeners for startup, install, and alarm refresh flows. */
// src/background/lifecycle.ts

import { browser } from 'wxt/browser';
import { getExtensionOptionsSnapshot, isProviderConfigured } from '@/options';
import { logError, normalizeError } from '@/shared/errors';
import { logger } from '@/shared/utils/logger';

const MAPPING_REFRESH_ALARM = 'a2a:refresh-static-mappings';
const MAPPING_REFRESH_PERIOD_MIN = 360;

const log = logger.create('Background');

async function shouldWarmMappingsCache(): Promise<boolean> {
  try {
    const options = await getExtensionOptionsSnapshot();
    return isProviderConfigured(options, 'sonarr') || isProviderConfigured(options, 'radarr');
  } catch (error) {
    logError(normalizeError(error), 'Background:shouldWarmMappingsCache');
    return false;
  }
}

const ensurePeriodicRefresh = async (
  api: { initMappings(): Promise<void> },
  alarmsApi: typeof browser.alarms | undefined,
): Promise<void> => {
  if (alarmsApi) {
    const existing = await alarmsApi.get(MAPPING_REFRESH_ALARM);
    if (!existing) {
      alarmsApi.create(MAPPING_REFRESH_ALARM, { periodInMinutes: MAPPING_REFRESH_PERIOD_MIN });
    }
    return;
  }

  const key = '__a2a_fallback_interval__';
  if (!(globalThis as Record<string, unknown>)[key]) {
    (globalThis as Record<string, unknown>)[key] = globalThis.setInterval(() => {
      void api.initMappings().catch(error => {
        logError(normalizeError(error), 'Background:initMappings:interval');
      });
    }, MAPPING_REFRESH_PERIOD_MIN * 60 * 1000);
  }
};

export const installBackgroundLifecycle = (api: { initMappings(): Promise<void> }): void => {
  const alarmsApi = (browser as unknown as { alarms?: typeof browser.alarms }).alarms;

  browser.runtime.onInstalled.addListener(async details => {
    try {
      if (details.reason === 'install' && import.meta.env.MODE !== 'test') {
        browser.runtime.openOptionsPage().catch(() => {});
      }

      if (await shouldWarmMappingsCache()) {
        await api.initMappings();
      }

      await ensurePeriodicRefresh(api, alarmsApi);
    } catch (error) {
      logError(normalizeError(error), 'Background:onInstalled');
    }
  });

  browser.runtime.onStartup.addListener(async () => {
    try {
      if (await shouldWarmMappingsCache()) {
        await api.initMappings();
      }

      await ensurePeriodicRefresh(api, alarmsApi);
    } catch (error) {
      logError(normalizeError(error), 'Background:onStartup');
    }
  });

  if (alarmsApi) {
    alarmsApi.onAlarm.addListener(alarm => {
      if (alarm.name === MAPPING_REFRESH_ALARM) {
        void (async () => {
          if (!(await shouldWarmMappingsCache())) {
            return;
          }
          await api.initMappings();
        })().catch(error => {
          logError(normalizeError(error), 'Background:initMappings:alarm');
        });
      }
    });
  }

  log.info('Background lifecycle listeners installed.');
};
