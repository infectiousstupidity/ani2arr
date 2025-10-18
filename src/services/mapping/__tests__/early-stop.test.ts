import { describe, it, expect } from 'vitest';
import { maybeEarlyStop, pickBest } from '@/services/mapping/early-stop';
import type { SonarrLookupSeries, ScoredCandidate } from '@/types';
import type { SearchTerm } from '@/services/mapping/search-term-generator';

const cand = (score: number): ScoredCandidate => {
  const term: SearchTerm = { canonical: 'c', display: 'd' };
  const result: SonarrLookupSeries = { tvdbId: Math.floor(score * 1000), title: 't' };
  return { term, result, score };
};

describe('early-stop utilities', () => {
  it('maybeEarlyStop returns no-stop for empty batch', () => {
    expect(maybeEarlyStop([], { earlyStopThreshold: 0.82, scoreThreshold: 0.76 })).toEqual({ stop: false });
  });

  it('maybeEarlyStop stops when top >= earlyStopThreshold', () => {
    const out = maybeEarlyStop([cand(0.85), cand(0.8)], { earlyStopThreshold: 0.82, scoreThreshold: 0.76 });
    expect(out.stop).toBe(true);
    expect(out.pick?.score).toBe(0.85);
  });

  it('maybeEarlyStop suggests viable pick but continues below earlyStopThreshold', () => {
    const out = maybeEarlyStop([cand(0.78), cand(0.7)], { earlyStopThreshold: 0.82, scoreThreshold: 0.76 });
    expect(out.stop).toBe(false);
    expect(out.pick?.score).toBe(0.78);
  });

  it('pickBest returns undefined below threshold', () => {
    expect(pickBest([cand(0.7)], 0.76)).toBeUndefined();
  });

  it('pickBest returns top when >= threshold', () => {
    const top = cand(0.9);
    expect(pickBest([top, cand(0.88)], 0.76)).toBe(top);
  });
});