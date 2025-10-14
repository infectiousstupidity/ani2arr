// src/services/mapping/early-stop.ts
import type { ScoredCandidate } from './types';

export interface EarlyStopLimits {
  earlyStopThreshold: number; // e.g., 0.82
  scoreThreshold: number; // e.g., 0.76
}

export function maybeEarlyStop(
  batch: ScoredCandidate[],
  limits: EarlyStopLimits,
): { stop: boolean; pick?: ScoredCandidate } {
  if (batch.length === 0) return { stop: false };
  const top = batch[0];
  const second = batch[1];
  if (top && top.score >= limits.earlyStopThreshold) {
    // basic margin check could be added if needed; keep simple per KISS
    return { stop: true, pick: top };
  }
  if (top && top.score >= limits.scoreThreshold && (!second || top.score > second.score)) {
    // keep iterating but acknowledge we have a viable candidate
    return { stop: false, pick: top };
  }
  return { stop: false };
}

export function pickBest(overall: ScoredCandidate[], scoreThreshold: number): ScoredCandidate | undefined {
  if (overall.length === 0) return undefined;
  const top = overall[0];
  if (top && top.score >= scoreThreshold) return top;
  return undefined;
}
