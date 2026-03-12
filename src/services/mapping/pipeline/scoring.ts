import type { MappingProvider } from '@/shared/types';
import type { ScoredCandidate } from './types';
import type { SearchTerm } from './search-term-generator';
import { computeTitleMatchScoreForProvider } from '@/services/mapping/pipeline/matching';
import type { ProviderLookupResult } from '../provider-lookup.client';

export function scoreCandidates<TResult extends ProviderLookupResult>(
  provider: MappingProvider,
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
  return scored.sort((a, b) => b.score - a.score);
}
