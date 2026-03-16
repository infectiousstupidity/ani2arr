// src/entrypoints/background/index.ts
import { browser } from 'wxt/browser';
import { registerAni2arrApi, getAni2arrApi } from '@/rpc';
import { createApiImplementation } from '@/services';
import { computeTitleMatchScore } from '@/services/mapping/pipeline/matching';
import { logger } from '@/shared/utils/logger';
import { createMetricsConsoleApi, type MetricsConsoleApi } from '@/shared/utils/metrics';
import { logError, normalizeError } from '@/shared/errors/error-utils';
import { getExtensionOptionsSnapshot } from '@/shared/options/storage';
import { CLIENT_STORAGE_RESET_MESSAGE_TYPE, CLIENT_STORAGE_RESET_TOPIC } from '@/shared/utils/client-storage';

type OptionsSectionId = 'sonarr' | 'radarr' | 'mappings' | 'ui' | 'advanced';

type OpenOptionsMessage = {
  type: 'OPEN_OPTIONS_PAGE';
  sectionId?: OptionsSectionId;
  targetAnilistId?: number;
};
type MappingRefreshMessage = { type: 'a2a:mapping:refresh' };
type ResetClientStorageMessage = { type: typeof CLIENT_STORAGE_RESET_MESSAGE_TYPE };
type ScoreBatchMessage = {
  type: 'a2a:match:score-batch';
  payload: {
    queryRaw: string;
    startYear?: number;
    candidates: Array<{ title: string; year?: number; genres?: string[] }>;
  };
};

function isScoreBatchMessage(x: unknown): x is ScoreBatchMessage {
  const m = x as Partial<ScoreBatchMessage>;
  return (
    m?.type === 'a2a:match:score-batch' &&
    typeof m.payload?.queryRaw === 'string' &&
    Array.isArray(m.payload?.candidates)
  );
}
function isOpenOptionsMessage(x: unknown): x is OpenOptionsMessage {
  return (x as OpenOptionsMessage)?.type === 'OPEN_OPTIONS_PAGE';
}
function isMappingRefreshMessage(x: unknown): x is MappingRefreshMessage {
  return (x as MappingRefreshMessage)?.type === 'a2a:mapping:refresh';
}
function isResetClientStorageMessage(x: unknown): x is ResetClientStorageMessage {
  return (x as ResetClientStorageMessage)?.type === CLIENT_STORAGE_RESET_MESSAGE_TYPE;
}

const MAPPING_REFRESH_ALARM = 'a2a:refresh-static-mappings';
const MAPPING_REFRESH_PERIOD_MIN = 360;
const CONTENT_SCRIPT_URL_PATTERNS = ['*://anilist.co/*', '*://www.anilist.co/*', '*://anichart.net/*', '*://www.anichart.net/*'];

const log = logger.create('Background');

const broadcastMessageToExtensionContexts = async (
  message: { _a2a: true; topic: string; payload?: Record<string, unknown> },
): Promise<void> => {
  try {
    await browser.runtime.sendMessage(message);
  } catch (error) {
    const normalized = normalizeError(error);
    if (!normalized.message.includes('Receiving end does not exist')) {
      logError(normalized, `Background:broadcast:${message.topic}`);
    }
  }

  try {
    const tabs = await browser.tabs.query({ url: CONTENT_SCRIPT_URL_PATTERNS });
    await Promise.all(
      tabs.map(async tab => {
        if (typeof tab.id !== 'number') {
          return;
        }

        try {
          await browser.tabs.sendMessage(tab.id, message);
        } catch (error) {
          const normalized = normalizeError(error);
          if (!normalized.message.includes('Receiving end does not exist')) {
            logError(normalized, `Background:broadcast:tab:${message.topic}`);
          }
        }
      }),
    );
  } catch (error) {
    logError(normalizeError(error), `Background:broadcast:tabsQuery:${message.topic}`);
  }
};

export default defineBackground(() => {
  log.info('Background initializing…');

  registerAni2arrApi(createApiImplementation());
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

  const shouldWarmMappingsCache = async (): Promise<boolean> => {
    try {
      const options = await getExtensionOptionsSnapshot();
      return Boolean(
        (options.providers.sonarr.url && options.providers.sonarr.apiKey) ||
        (options.providers.radarr.url && options.providers.radarr.apiKey),
      );
    } catch (error) {
      logError(normalizeError(error), 'Background:shouldWarmMappingsCache');
      return false;
    }
  };

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
    alarmsApi.onAlarm.addListener((alarm) => {
      if (alarm.name === MAPPING_REFRESH_ALARM) {
        void (async () => {
          if (!(await shouldWarmMappingsCache())) {
            return;
          }
          await api.initMappings();
        })().catch(err => {
          logError(normalizeError(err), 'Background:initMappings:alarm');
        });
      }
    });
  }

  browser.runtime.onMessage.addListener(
    (message: unknown, sender?: { id?: string }): Promise<unknown> | void => {
      // Only accept messages originating from the extension itself and that
      // explicitly carry the _a2a marker to prevent other origins from
      // invoking privileged background handlers.
      const senderId = (sender as { id?: string } | undefined)?.id;
      const msg = message as { type?: string; timestamp?: number; _a2a?: boolean } | undefined;

      if (senderId !== browser.runtime.id) {
        // Ignore messages from other extensions/origins or no sender info.
        return;
      }

      if (!msg?._a2a) {
        // Marker missing; ignore.
        return;
      }

      // Lightweight readiness probe so content scripts can wait until the
      // background has registered services before issuing RPC calls.
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
            : targetHash
              ? `${baseUrl}#${targetHash}`
              : baseUrl;

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

      if (isMappingRefreshMessage(msg)) {
        void api.initMappings();
        return Promise.resolve({ ok: true as const });
      }

      if (isResetClientStorageMessage(msg)) {
        return api.resetExtensionState().then(() =>
          broadcastMessageToExtensionContexts({
            _a2a: true,
            topic: CLIENT_STORAGE_RESET_TOPIC,
          }).then(() => ({ ok: true as const })),
        );
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
