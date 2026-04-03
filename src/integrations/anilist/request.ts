/** Low-level AniList GraphQL POST request helper. */
// src/integrations/anilist/request.ts

import {
  ANILIST_GRAPHQL_API_URL,
  DEFAULT_ANILIST_RETRY_AFTER_MS,
} from '@/integrations/anilist/constants';
import { AniListHttpError, AniListRateLimitError } from '@/integrations/anilist/errors';
import { toAniListResponseMeta } from '@/integrations/anilist/rate-limit';
import type { AniListResponseMeta } from '@/integrations/anilist/types';

interface RequestParams<TVariables> {
  query: string;
  variables: TVariables;
}

export async function postAniList<TResponse, TVariables extends Record<string, unknown>>(
  params: RequestParams<TVariables>,
): Promise<{ payload: TResponse; meta: AniListResponseMeta }> {
  const response = await fetch(ANILIST_GRAPHQL_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: params.query, variables: params.variables }),
  });
  const meta = toAniListResponseMeta(response);

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfterMs = meta.rateLimit.retryAfterMs ?? DEFAULT_ANILIST_RETRY_AFTER_MS;
      const pausedUntil = meta.rateLimit.resetAt ?? (meta.receivedAt + retryAfterMs);
      throw new AniListRateLimitError(meta, pausedUntil);
    }

    throw new AniListHttpError(response.status, undefined, meta);
  }

  return {
    payload: (await response.json()) as TResponse,
    meta,
  };
}
