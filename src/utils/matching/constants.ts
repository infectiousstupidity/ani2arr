// Centralized weights/thresholds for title matching.
// Keep values aligned with prior behavior; adjust via tests and decision docs.

export const WEIGHT_OVERLAP = 0.6;
export const WEIGHT_CHAR_SIM = 0.4;

export const BONUS_YEAR_EXACT = 0.1;
export const BONUS_YEAR_ONE_OFF = 0.06;
export const BONUS_YEAR_CAP = 0.999; // avoid returning 1.0 solely due to one-off year bonus

export const PENALTY_NON_ANIMATION_FACTOR = 0.85;
export const PENALTY_VERBOSE_QUERY_FACTOR = 0.85;

// Token rarity threshold (used for early rare-token intersection short-circuit)
export const RARE_TOKEN_MIN_LEN = 4;
