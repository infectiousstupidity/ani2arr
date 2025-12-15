import type { SonarrLookupSeries, ScoredCandidate } from '@/shared/types';
import type { SearchTerm } from './search-term-generator';
import { computeTitleMatchScore } from '@/shared/utils/matching';

export function scoreCandidates(
  term: SearchTerm,
  results: SonarrLookupSeries[],
  targetYear?: number,
): ScoredCandidate[] {
  const scored: ScoredCandidate[] = [];
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
