/** Background bootstrap wiring for API registration, lifecycle, and message handlers. */
// src/background/bootstrap.ts

import { registerAni2arrApi, getAni2arrApi } from '@/rpc';
import { createMetricsConsoleApi, type MetricsConsoleApi } from '@/debug/metrics';
import { logger } from '@/shared/utils/logger';
import { createBackgroundApi } from './api/create-background-api';
import { installBackgroundLifecycle } from './lifecycle';
import { installBackgroundRuntimeMessages } from './runtime-messages';

const log = logger.create('Background');

export const bootstrapBackground = (): void => {
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
  installBackgroundLifecycle(api);
  installBackgroundRuntimeMessages();

  log.info('Background setup complete.');
};
