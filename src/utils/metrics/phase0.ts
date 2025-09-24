// src/utils/metrics/phase0.ts

/**
 * @file Tracks lightweight counters used for Phase 0 telemetry experiments.
 * Counters are emitted through the logger so that they follow the same
 * development-only visibility rules as other verbose diagnostics.
 */

import { logger } from '@/utils/logger';

export type Phase0CounterKey =
  | 'cache-hit'
  | 'static-primary'
  | 'static-fallback'
  | 'anilist-direct'
  | 'sonarr-lookup';

type Phase0Counters = Record<Phase0CounterKey, number>;

const counters: Phase0Counters = {
  'cache-hit': 0,
  'static-primary': 0,
  'static-fallback': 0,
  'anilist-direct': 0,
  'sonarr-lookup': 0,
};

const metricsLogger = logger.create('Phase 0 Metrics');

export function incrementPhase0Counter(key: Phase0CounterKey): void {
  counters[key] += 1;

  if (logger.isLevelEnabled('debug')) {
    metricsLogger.debug(`counter '${key}' -> ${counters[key]}`);
  }
}

export function getPhase0Counters(): Readonly<Phase0Counters> {
  return { ...counters };
}

export function resetPhase0Counters(): void {
  (Object.keys(counters) as Phase0CounterKey[]).forEach((key) => {
    counters[key] = 0;
  });

  if (logger.isLevelEnabled('debug')) {
    metricsLogger.debug('Phase 0 counters reset');
  }
}