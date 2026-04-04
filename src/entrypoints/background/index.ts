/** Background entrypoint that boots the extension runtime and registers browser-owned listeners. */
// src/entrypoints/background/index.ts

import { browser } from 'wxt/browser';
import { registerAni2arrApi, getAni2arrApi } from '@/rpc';
import { createBackgroundApi } from '@/runtime/create-background-api';
import { createMetricsConsoleApi, type MetricsConsoleApi } from '@/debug/metrics';
import { logger } from '@/shared/utils/logger';
import { logError, normalizeError } from '@/shared/errors';
import { getExtensionOptionsSnapshot, isProviderConfigured } from '@/options';

type OptionsSectionId = 'sonarr' | 'radarr' | 'mappings' | 'ui' | 'advanced';

type OpenOptionsMessage = {
  type: 'OPEN_OPTIONS_PAGE';
  sectionId?: OptionsSectionId;
  targetAnilistId?: number;
};

function isOpenOptionsMessage(x: unknown): x is OpenOptionsMessage {
  return (x as OpenOptionsMessage)?.type === 'OPEN_OPTIONS_PAGE';
}

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

export default defineBackground(() => {
  log.info('Background initializing…');

  registerAni2arrApi(createBackgroundApi());
  log.info('API services registered.');

  if (import.meta.env.DEV) {
    const globalWithMetrics = globalThis as typeof globalThis & {
      __a2aMetrics?: MetricsConsoleApi;
    };

    if (!globalWithMetrics.__a2aMetrics) {
      globalWithMetrics.__a2aMetrics = createMetricsConsoleApi();
    }
  }

  const api = getAni2arrApi();
  const alarmsApi = (browser as unknown as { alarms?: typeof browser.alarms }).alarms;

  const ensurePeriodicRefresh = async (): Promise<void> => {
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

  browser.runtime.onInstalled.addListener(async details => {
    try {
      if (details.reason === 'install' && import.meta.env.MODE !== 'test') {
        browser.runtime.openOptionsPage().catch(() => {});
      }

      if (await shouldWarmMappingsCache()) {
        await api.initMappings();
      }

      await ensurePeriodicRefresh();
    } catch (error) {
      logError(normalizeError(error), 'Background:onInstalled');
    }
  });

  browser.runtime.onStartup.addListener(async () => {
    try {
      if (await shouldWarmMappingsCache()) {
        await api.initMappings();
      }

      await ensurePeriodicRefresh();
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

  browser.runtime.onMessage.addListener(
    (message: unknown, sender?: { id?: string }): Promise<unknown> | void => {
      const senderId = (sender as { id?: string } | undefined)?.id;
      const msg = message as { type?: string; timestamp?: number; _a2a?: boolean } | undefined;

      if (senderId !== browser.runtime.id) {
        return;
      }

      if (!msg?._a2a) {
        return;
      }

      if (msg.type === 'a2a:ping') {
        return Promise.resolve({ ok: true as const });
      }

      if (isOpenOptionsMessage(msg)) {
        const open = async (): Promise<void> => {
          try {
            const section =
              msg.sectionId === 'sonarr' ||
              msg.sectionId === 'radarr' ||
              msg.sectionId === 'mappings' ||
              msg.sectionId === 'ui' ||
              msg.sectionId === 'advanced'
                ? msg.sectionId
                : null;

            const baseUrl = browser.runtime.getURL('/options.html');
            const targetHash =
              typeof msg.targetAnilistId === 'number' && Number.isFinite(msg.targetAnilistId)
                ? `?anilistId=${msg.targetAnilistId}`
                : '';

            const url = section
              ? `${baseUrl}#/options/${section}${targetHash}`
              : (targetHash ? `${baseUrl}#${targetHash}` : baseUrl);

            await browser.tabs.create({ url });
          } catch {
            try {
              await browser.runtime.openOptionsPage();
            } catch {
              // best-effort only
            }
          }
        };

        void open();
        return;
      }
    },
  );

  log.info('Background setup complete.');
});
