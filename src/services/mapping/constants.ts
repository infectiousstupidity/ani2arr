// src/services/mapping/constants.ts
// TTL and domain constants for mapping services.
export const RESOLVED_PERSIST_MS = 10 * 365 * 24 * 60 * 60 * 1000; // ~10 years (effectively permanent)

// Validation (no-match) failures should not re-trigger pipeline repeatedly during browsing.
export const NO_MATCH_SOFT_TTL = 24 * 60 * 60 * 1000; // 24 hours
export const NO_MATCH_HARD_TTL = 48 * 60 * 60 * 1000; // 48 hours

export const FAILURE_SOFT_TTL = 30 * 60 * 1000; // 30 minutes (config/perm/api)
export const FAILURE_HARD_TTL = FAILURE_SOFT_TTL * 2;
export const NETWORK_FAILURE_SOFT_TTL = 5 * 60 * 1000; // 5 minutes
export const NETWORK_FAILURE_HARD_TTL = NETWORK_FAILURE_SOFT_TTL * 3;

export const ALLOWED_FORMATS = new Set(['TV', 'TV_SHORT', 'ONA', 'OVA', 'SPECIAL']);

// Scoring thresholds for mapping resolution.
/** Minimum score for a candidate to be considered a valid match. */
export const SCORE_THRESHOLD = 0.76;

/** Score at which we can stop searching early (high confidence match). */
export const EARLY_STOP_THRESHOLD = 0.82;

/** Maximum number of search terms to try before giving up. */
export const MAX_SEARCH_TERMS = 5;

/** Soft time budget for pipeline search loop (ms). */
export const PIPELINE_SOFT_TIME_BUDGET_MS = 2000;