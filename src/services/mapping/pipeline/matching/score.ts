import {
  WEIGHT_OVERLAP,
  WEIGHT_CHAR_SIM,
  BONUS_YEAR_CAP,
  BONUS_YEAR_EXACT,
  BONUS_YEAR_ONE_OFF,
  PENALTY_NON_ANIMATION_FACTOR,
  PENALTY_VERBOSE_QUERY_FACTOR,
  RARE_TOKEN_MIN_LEN,
} from './constants';
import { diceBigram, normTitle, tokenize, tokenOverlap } from './normalize';

function hasRareTokenIntersection(query: string[], cand: string[]): boolean {
  const setC = new Set(cand.filter(t => t.length >= RARE_TOKEN_MIN_LEN));
  for (const q of query) if (q.length >= RARE_TOKEN_MIN_LEN && setC.has(q)) return true;
  return false;
}

export function composeBaseScore(qn: string, cn: string, qTok: string[], cTok: string[]): number {
  const overlap = tokenOverlap(qTok, cTok);
  const charSim = diceBigram(qn, cn);
  return WEIGHT_OVERLAP * overlap + WEIGHT_CHAR_SIM * charSim;
}

export function applyYearBonus(score: number, candidateYear?: number, targetYear?: number): number {
  if (targetYear === undefined || candidateYear === undefined) return score;
  const d = Math.abs(targetYear - candidateYear);
  if (d === 0) return Math.min(BONUS_YEAR_CAP, score + BONUS_YEAR_EXACT);
  if (d === 1) return Math.min(BONUS_YEAR_CAP, score + BONUS_YEAR_ONE_OFF);
  return score;
}

export function applyGenrePenalty(score: number, candidateGenres?: readonly string[]): number {
  if (!Array.isArray(candidateGenres) || candidateGenres.length === 0) return score;
  const normalizedGenres = candidateGenres.map(g => g.trim().toLowerCase());
  const hasAnimation = normalizedGenres.some(g => g === 'animation' || g === 'anime');
  return hasAnimation ? score : score * PENALTY_NON_ANIMATION_FACTOR;
}

export function applyVerbosePenalty(score: number, queryTokens: string[], candNorm: string, queryNorm: string): number {
  if (queryTokens.length <= 1 && candNorm.length > queryNorm.length * 2) {
    return score * PENALTY_VERBOSE_QUERY_FACTOR;
  }
  return score;
}

export function computeTitleMatchScore(params: {
  queryRaw: string;
  candidateRaw: string;
  candidateYear?: number;
  targetYear?: number;
  candidateGenres?: readonly string[];
}): number {
  const qn = normTitle(params.queryRaw);
  const cn = normTitle(params.candidateRaw);
  const qTok = tokenize(qn);
  const cTok = tokenize(cn);

  if (!hasRareTokenIntersection(qTok, cTok)) return 0;

  let score = composeBaseScore(qn, cn, qTok, cTok);
  score = applyYearBonus(score, params.candidateYear, params.targetYear);
  score = applyVerbosePenalty(score, qTok, cn, qn);
  score = Math.max(0, Math.min(1, score));
  score = applyGenrePenalty(score, params.candidateGenres);

  return Math.max(0, Math.min(1, score));
}
