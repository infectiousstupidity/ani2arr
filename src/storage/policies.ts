/** Shared TTL and cache policy constants used by storage-backed caches. */
// src/lib/storage/policies.ts

export const STORAGE_POLICIES = {
  anilistMedia: {
    staleMs: 14 * 24 * 60 * 60 * 1000,
    hardMs: 60 * 24 * 60 * 60 * 1000,
  },
  upstreamMappings: {
    staleMs: 24 * 60 * 60 * 1000,
    hardMs: 7 * 24 * 60 * 60 * 1000,
  },
  lookupPositive: {
    staleMs: 10 * 60 * 1000,
    hardMs: 30 * 60 * 60 * 1000,
  },
  lookupNegative: {
    staleMs: 24 * 60 * 60 * 1000,
    hardMs: 48 * 60 * 60 * 1000,
  },
  providerLibrary: {
    staleMs: 60 * 60 * 1000,
    hardMs: 24 * 60 * 60 * 1000,
    errorStaleMs: 5 * 60 * 1000,
    errorHardMs: 10 * 60 * 1000,
  },
  extensionMapping: {
  staleMs: 7 * 24 * 60 * 60 * 1000,
  hardMs: 30 * 24 * 60 * 60 * 1000,
},
} as const;
