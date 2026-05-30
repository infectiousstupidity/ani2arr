/** Low-level AniList GraphQL POST request helper. */
// src/anilist/transport/request.ts

import {
  ANILIST_GRAPHQL_API_URL,
  DEFAULT_ANILIST_RETRY_AFTER_MS,
} from '@/anilist/transport/constants';
import { AniListHttpError, AniListRateLimitError } from '@/anilist/transport/errors';
import { toAniListResponseMeta } from '@/anilist/transport/rate-limit';
import type { AniListResponseMeta } from '@/anilist/transport/types';

interface RequestParams {
  query: string;
  variables: Record<string, unknown>;
}

export async function postAniList(
  params: RequestParams,
): Promise<{ payload: unknown; meta: AniListResponseMeta }> {
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
    payload: await response.json(),
    meta,
  };
}
