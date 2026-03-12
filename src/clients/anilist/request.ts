import { API_URL, DEFAULT_RATE_LIMIT_DELAY_MS } from './constants';
import { AniListHttpError, AniListRateLimitError } from './errors';
import { toAniListRequestMeta } from './rate-limit';

interface RequestParams<TVariables> {
  query: string;
  variables: TVariables;
}

export interface AniListResponse<TPayload> {
  payload: TPayload;
  meta: ReturnType<typeof toAniListRequestMeta>;
}

export async function postAniList<TResponse, TVariables extends Record<string, unknown>>(
  params: RequestParams<TVariables>,
): Promise<AniListResponse<TResponse>> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: params.query, variables: params.variables }),
  });
  const meta = toAniListRequestMeta(response);

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfterMs = meta.rateLimit.retryAfterMs ?? DEFAULT_RATE_LIMIT_DELAY_MS;
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
