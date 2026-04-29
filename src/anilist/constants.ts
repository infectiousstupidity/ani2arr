/** AniList domain workflow scheduling, cache, and orchestration constants. */
// src/anilist/constants.ts

export const QUEUE_CONCURRENCY = 1;
export const DEFAULT_PREQUEL_DEPTH = 5;
export const MAX_BATCH_SIZE = 50;
export const LOW_PRIORITY_MIN_DISPATCH_GAP_MS = 350;
export const LOW_PRIORITY_REMAINING_FLOOR = 2;
export const LOW_PRIORITY_REMAINING_RATIO = 0.1;
