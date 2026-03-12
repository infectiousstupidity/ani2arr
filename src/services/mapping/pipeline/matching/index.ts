// Public surface for mapping matching utilities.
// Consumers import from '@/services/mapping/pipeline/matching'.

export {
  normTitle,
  stripParenContent,
  normalizeTitleTokens,
  canonicalizeLookupTerm,
  tokenize,
  diceBigram,
  tokenOverlap,
  isOrdinalToken,
} from './normalize';

export {
  stripSeasonalSuffixes,
  stripTrailingOrdinalOrNumber,
  sanitizeLookupDisplay,
} from './season';

export {
  computeTitleMatchScoreForProvider,
  computeTitleMatchScore,
  composeBaseScore,
  applyYearBonus,
  applyGenrePenalty,
  applyVerbosePenalty,
} from './score';

export {
  WEIGHT_OVERLAP,
  WEIGHT_CHAR_SIM,
  BONUS_YEAR_EXACT,
  BONUS_YEAR_ONE_OFF,
  BONUS_YEAR_CAP,
  PENALTY_NON_ANIMATION_FACTOR,
  PENALTY_VERBOSE_QUERY_FACTOR,
} from './constants';

export { canonicalTitleKey } from './key';

export {
  getMatchingProfile,
  compactTitleKey,
  sanitizeLookupDisplayForProvider,
  sanitizeLookupDisplayWithProfile,
  canonicalTitleKeyForProvider,
  canonicalizeLookupTermForProvider,
  buildTitleIndexKeysForProvider,
  buildQueryTitleVariantsForProvider,
  extractCandidateTitleVariants,
} from './profile';

export type { CandidateTitleVariant, CandidateTitleVariantSource, MatchingProfile } from './profile';
