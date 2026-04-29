/** Search thresholds used across mapping resolution. */
// src/mapping/constants.ts

// Scoring thresholds for mapping resolution.
/** Minimum score for a candidate to be considered a valid match. */
export const SCORE_THRESHOLD = 0.76;

/** Score at which we can stop searching early (high confidence match). */
export const EARLY_STOP_THRESHOLD = 0.82;

/** Maximum number of search terms to try before giving up. */
export const MAX_SEARCH_TERMS = 5;

/** Soft time budget for pipeline search loop (ms). */
export const PIPELINE_SOFT_TIME_BUDGET_MS = 2000;
