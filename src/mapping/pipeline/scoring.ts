/** Candidate scoring pass that ranks provider lookup results against a generated search term. */
// src/mapping/pipeline/scoring.ts

import type { Provider } from '@/providers';
import type { ScoredCandidate } from './types';
import type { SearchTerm } from './search-term-generator';
import { computeTitleMatchScoreForProvider } from '@/mapping/pipeline/matching';
import type { ProviderLookupResult } from '../lookup';

export function scoreCandidates<TResult extends ProviderLookupResult>(
  provider: Provider,
  term: SearchTerm,
  results: TResult[],
  targetYear?: number,
): ScoredCandidate<TResult>[] {
  const scored: ScoredCandidate<TResult>[] = [];
  for (const candidate of results) {
    const score = computeTitleMatchScoreForProvider({
      provider,
      queryRaw: term.display,
      candidate,
      ...(typeof candidate.year === 'number' ? { candidateYear: candidate.year } : {}),
      ...(typeof targetYear === 'number' ? { targetYear } : {}),
      ...(Array.isArray(candidate.genres) ? { candidateGenres: candidate.genres } : {}),
      candidateCount: results.length,
    });
    scored.push({ term, result: candidate, score });
  }
  return scored.toSorted((a, b) => b.score - a.score);
}
