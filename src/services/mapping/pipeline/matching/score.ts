import type { MappingProvider } from '@/shared/types';
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
import {
  buildQueryTitleVariantsForProvider,
  compactTitleKey,
  extractCandidateTitleVariants,
  getMatchingProfile,
  type CandidateTitleVariant,
} from './profile';

function hasRareTokenIntersection(query: string[], cand: string[]): boolean {
  const setC = new Set(cand.filter(t => t.length >= RARE_TOKEN_MIN_LEN));
  for (const q of query) {
    if (q.length >= RARE_TOKEN_MIN_LEN && setC.has(q)) return true;
  }
  return false;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(1, score));
}

function isAliasVariant(source: CandidateTitleVariant['source']): boolean {
  return source !== 'title';
}

function variantFloor(
  provider: MappingProvider,
  variant: CandidateTitleVariant,
  kind: 'exact' | 'compact',
): number {
  const profile = getMatchingProfile(provider);
  const alias = isAliasVariant(variant.source);
  if (kind === 'exact') {
    return alias ? profile.exactAliasFloor : profile.exactTitleFloor;
  }
  return alias ? profile.compactAliasFloor : profile.compactTitleFloor;
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

function applyYearWeightingForProvider(
  provider: MappingProvider,
  score: number,
  candidateYear?: number,
  targetYear?: number,
): number {
  if (provider === 'sonarr') {
    return applyYearBonus(score, candidateYear, targetYear);
  }

  if (targetYear === undefined || candidateYear === undefined) return score;
  const profile = getMatchingProfile(provider);
  const distance = Math.abs(targetYear - candidateYear);
  if (distance === 0) return Math.min(BONUS_YEAR_CAP, score + profile.yearExactBonus);
  if (distance === 1) return Math.min(BONUS_YEAR_CAP, score + profile.yearOneOffBonus);
  if (distance === 2) return score * profile.yearMismatchFactor;
  return score * profile.yearFarMismatchFactor;
}

export function computeTitleMatchScoreForProvider(params: {
  provider: MappingProvider;
  queryRaw: string;
  candidate: unknown;
  candidateYear?: number;
  targetYear?: number;
  candidateGenres?: readonly string[];
  candidateCount?: number;
}): number {
  const profile = getMatchingProfile(params.provider);
  const queryVariants = buildQueryTitleVariantsForProvider(params.provider, params.queryRaw);
  const candidateVariants = extractCandidateTitleVariants(params.provider, params.candidate);

  if (queryVariants.length === 0 || candidateVariants.length === 0) return 0;

  let bestScore = 0;
  let bestExact = false;
  let bestCompact = false;

  for (const queryVariant of queryVariants) {
    const queryNorm = normTitle(queryVariant.value);
    const queryTokens = tokenize(queryNorm);
    const queryCompact = compactTitleKey(queryVariant.value);

    if (!queryNorm) continue;

    for (const candidateVariant of candidateVariants) {
      const candidateNorm = normTitle(candidateVariant.value);
      if (!candidateNorm) continue;

      const candidateTokens = tokenize(candidateNorm);
      const candidateCompact = compactTitleKey(candidateVariant.value);
      const exactNormalized = queryNorm === candidateNorm;
      const exactCompact = Boolean(queryCompact) && queryCompact === candidateCompact;

      if (
        profile.rareTokenGate === 'hard' &&
        !exactNormalized &&
        !exactCompact &&
        !hasRareTokenIntersection(queryTokens, candidateTokens)
      ) {
        continue;
      }

      let score = composeBaseScore(queryNorm, candidateNorm, queryTokens, candidateTokens);

      if (exactNormalized) {
        score = Math.max(score, variantFloor(params.provider, candidateVariant, 'exact'));
      }
      if (exactCompact) {
        score = Math.max(score, variantFloor(params.provider, candidateVariant, 'compact'));
      }

      score = applyYearWeightingForProvider(params.provider, score, params.candidateYear, params.targetYear);
      score = applyVerbosePenalty(score, queryTokens, candidateNorm, queryNorm);
      score = clampScore(score);

      if (score > bestScore) {
        bestScore = score;
        bestExact = exactNormalized;
        bestCompact = exactCompact;
      }
    }
  }

  bestScore = applyGenrePenalty(bestScore, params.candidateGenres);

  if (
    params.provider === 'radarr' &&
    params.candidateCount === 1 &&
    bestScore >= profile.singleResultFloor &&
    params.targetYear !== undefined &&
    params.candidateYear !== undefined &&
    params.targetYear === params.candidateYear &&
    (bestExact || bestCompact || bestScore >= profile.singleResultFloor)
  ) {
    bestScore += profile.singleResultBoost;
  }

  return clampScore(bestScore);
}

export function computeTitleMatchScore(params: {
  queryRaw: string;
  candidateRaw: string;
  candidateYear?: number;
  targetYear?: number;
  candidateGenres?: readonly string[];
}): number {
  return computeTitleMatchScoreForProvider({
    provider: 'sonarr',
    queryRaw: params.queryRaw,
    candidate: { title: params.candidateRaw },
    ...(typeof params.candidateYear === 'number' ? { candidateYear: params.candidateYear } : {}),
    ...(typeof params.targetYear === 'number' ? { targetYear: params.targetYear } : {}),
    ...(Array.isArray(params.candidateGenres) ? { candidateGenres: params.candidateGenres } : {}),
    candidateCount: 1,
  });
}
