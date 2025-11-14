// src/services/library/sonarr/constants.ts
export const CACHE_KEY = 'sonarr:lean-series';

export const SOFT_TTL_MS = 60 * 60 * 1000; // 1h
export const HARD_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const ERROR_TTL_MS = 5 * 60 * 1000; // 5m

export const LOCAL_INDEX_ACCEPTANCE_THRESHOLD = 0.8;
