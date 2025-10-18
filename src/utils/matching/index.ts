// Public surface for matching utilities.
// Consumers import from '@/utils/matching'.

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
