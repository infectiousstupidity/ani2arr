import type { ScoredCandidate } from './types';
import type { SearchTerm } from './search-term-generator';
import { computeTitleMatchScore } from '@/services/mapping/pipeline/matching';
import type { ProviderLookupResult } from '../provider-lookup.client';

export function scoreCandidates<TResult extends ProviderLookupResult>(
  term: SearchTerm,
  results: TResult[],
  targetYear?: number,
): ScoredCandidate<TResult>[] {
  const scored: ScoredCandidate<TResult>[] = [];
  for (const candidate of results) {
    const scoreParams = {
      queryRaw: term.display,
      candidateRaw: candidate.title,
      ...(typeof candidate.year === 'number' ? { candidateYear: candidate.year } : {}),
      ...(typeof targetYear === 'number' ? { targetYear } : {}),
      ...(Array.isArray(candidate.genres) ? { candidateGenres: candidate.genres } : {}),
    } satisfies Parameters<typeof computeTitleMatchScore>[0];

    const score = computeTitleMatchScore(scoreParams);
    scored.push({ term, result: candidate, score });
  }
  return scored.sort((a, b) => b.score - a.score);
}
