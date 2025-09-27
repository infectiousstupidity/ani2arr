// src/rpc/schemas.ts
import { z } from 'zod';

/**
 * Schema contract for Kitsunarr RPC after cache/refactor.
 */

// ---------- Mapping ----------
export const ResolveInput = z.object({
  anilistId: z.number().int().positive(),
  // optional title hint to bias matching (not required by current callers)
  primaryTitleHint: z.string().trim().min(1).optional(),
});

export const MappingOutput = z.object({
  tvdbId: z.number().int().positive(),
  successfulSynonym: z.string().optional(),
});

// ---------- Library / Status ----------
export const StatusInput = z.object({
  anilistId: z.number().int().positive(),
  title: z.string().trim().min(1).optional(),          // hint for matching
  force_verify: z.boolean().optional(),                 // when true, hit Sonarr even if cached
  network: z.literal('never').optional(),               // when set, do not hit network at all
  ignoreFailureCache: z.boolean().optional(),           // bypass negative cache
});

// LeanSonarrSeries
const LeanSeries = z.object({
  tvdbId: z.number().int().positive(),
  id: z.number().int().positive(),
  titleSlug: z.string(),
});

export const StatusOutput = z.object({
  exists: z.boolean(),
  tvdbId: z.number().int().nullable(),
  successfulSynonym: z.string().optional(),
  anilistTvdbLinkMissing: z.boolean().optional(),
  series: LeanSeries.optional(),
});

// ---------- Mutations ----------
export const AddInput = z.object({
  tvdbId: z.number().int().positive(),
  profileId: z.number().int().positive(),
  path: z.string().min(1),
});
