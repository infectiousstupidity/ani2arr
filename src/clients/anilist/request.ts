import { API_URL, DEFAULT_RATE_LIMIT_DELAY_MS } from './constants';
import { AniListHttpError, AniListRateLimitError } from './errors';

interface RequestParams<TVariables> {
  query: string;
  variables: TVariables;
}

export async function postAniList<TResponse, TVariables extends Record<string, unknown>>(
  params: RequestParams<TVariables>,
): Promise<TResponse> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: params.query, variables: params.variables }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = parseRetryAfterMs(response.headers.get('Retry-After'));
      const delay = typeof retryAfter === 'number' ? Math.max(0, retryAfter) : DEFAULT_RATE_LIMIT_DELAY_MS;
      throw new AniListRateLimitError(delay);
    }

    throw new AniListHttpError(response.status);
  }

  return (await response.json()) as TResponse;
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const numeric = Number(header);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric * 1000;
  }
  const parsed = Date.parse(header);
  if (Number.isNaN(parsed)) return null;
  const delayMs = parsed - Date.now();
  return delayMs > 0 ? delayMs : null;
}
