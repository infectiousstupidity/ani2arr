/** Transport-local AniList response metadata used by request and rate-limit handling. */
// src/integrations/anilist/types.ts

export interface AniListRateLimitMeta {
  limit: number | null;
  remaining: number | null;
  resetAt: number | null;
  retryAfterMs: number | null;
}

export interface AniListResponseMeta {
  status: number;
  headers: Record<string, string>;
  rateLimit: AniListRateLimitMeta;
  receivedAt: number;
}
