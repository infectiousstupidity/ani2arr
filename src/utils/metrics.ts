// src/utils/metrics.ts
export type CounterName = string;
export type HistogramName = string;

interface HistogramState {
  readonly buckets: readonly number[];
  counts: number[];
  sum: number;
  count: number;
}

export interface HistogramSnapshot {
  buckets: readonly number[];
  counts: readonly number[];
  sum: number;
  count: number;
}

export interface MetricsSnapshot {
  counters: Record<CounterName, number>;
  histograms: Record<HistogramName, HistogramSnapshot>;
}

export interface MetricsConsoleApi {
  snapshot(): MetricsSnapshot;
  reset(): void;
  print(): void;
}

const counters = new Map<CounterName, number>();
const histograms = new Map<HistogramName, HistogramState>();

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function ensureHistogram(name: HistogramName, buckets: readonly number[]): HistogramState {
  const existing = histograms.get(name);
  if (existing) {
    const mismatch =
      existing.buckets.length !== buckets.length ||
      existing.buckets.some((value, index) => value !== buckets[index]);
    if (mismatch) {
      throw new Error(`Histogram "${name}" registered with conflicting buckets.`);
    }
    return existing;
  }

  const state: HistogramState = {
    buckets: [...buckets],
    counts: new Array(buckets.length + 1).fill(0),
    sum: 0,
    count: 0,
  };
  histograms.set(name, state);
  return state;
}

export function incrementCounter(name: CounterName, value = 1): void {
  if (!Number.isFinite(value) || value === 0) return;
  const current = counters.get(name) ?? 0;
  counters.set(name, current + value);
}

export function recordDuration(
  name: HistogramName,
  durationMs: number,
  buckets: readonly number[],
): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return;
  }

  const histogram = ensureHistogram(name, buckets);
  histogram.count += 1;
  histogram.sum += durationMs;

  let bucketIndex = histogram.buckets.findIndex(boundary => durationMs <= boundary);
  if (bucketIndex === -1) {
    bucketIndex = histogram.buckets.length;
  }
  histogram.counts[bucketIndex] = (histogram.counts[bucketIndex] ?? 0) + 1;
}

export function getCounterValue(name: CounterName): number {
  return counters.get(name) ?? 0;
}

export function getHistogramSnapshot(name: HistogramName): HistogramSnapshot | null {
  const snapshot = histograms.get(name);
  if (!snapshot) return null;
  return {
    buckets: [...snapshot.buckets],
    counts: [...snapshot.counts],
    sum: snapshot.sum,
    count: snapshot.count,
  };
}

export function getMetricsSnapshot(): MetricsSnapshot {
  const counterSnapshot: Record<string, number> = {};
  for (const [name, value] of counters.entries()) {
    counterSnapshot[name] = value;
  }

  const histogramSnapshot: Record<string, HistogramSnapshot> = {};
  for (const [name, state] of histograms.entries()) {
    histogramSnapshot[name] = {
      buckets: [...state.buckets],
      counts: [...state.counts],
      sum: state.sum,
      count: state.count,
    };
  }

  return { counters: counterSnapshot, histograms: histogramSnapshot };
}

export function resetMetrics(): void {
  counters.clear();
  histograms.clear();
}

export function createMetricsConsoleApi(): MetricsConsoleApi {
  return {
    snapshot: getMetricsSnapshot,
    reset: resetMetrics,
    print(): void {
      const snapshot = getMetricsSnapshot();
      console.log('ani2arr metrics snapshot', snapshot);
    },
  };
}

export async function timeAsync<T>(
  name: HistogramName,
  buckets: readonly number[],
  fn: () => Promise<T>,
): Promise<T> {
  const start = now();
  try {
    return await fn();
  } finally {
    recordDuration(name, now() - start, buckets);
  }
}
