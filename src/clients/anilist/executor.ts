import { withRetry, AbortError } from '@/shared/utils/retry';
import { createError, ErrorCode } from '@/shared/errors/error-utils';
import type { AniListSearchResult, AniMedia } from '@/shared/types';
import {
  AniListAbortError,
  isAniListAbortError,
  isHttpError,
  isRateLimitError,
} from './errors';
import { postAniList } from './request';
import {
  FIND_MEDIA_BATCH_QUERY,
  SEARCH_MEDIA_QUERY,
} from './queries';
import type { AniListRateLimiter, AniListRequestMeta } from './rate-limit';
import type {
  ExtensionErrorLike,
  FindMediaBatchResponse,
  SearchMediaResponse,
} from './types';

type ExecutorDeps = {
  limiter: AniListRateLimiter;
};

export class AniListExecutor {
  private readonly limiter: ExecutorDeps['limiter'];

  constructor(deps: ExecutorDeps) {
    this.limiter = deps.limiter;
  }

  public fetchBatch(ids: number[]): Promise<AniMedia[]> {
    return this.executeGraphql<FindMediaBatchResponse, AniMedia[]>(
      () => postAniList({ query: FIND_MEDIA_BATCH_QUERY, variables: { ids } }),
      payload => {
        if (payload?.errors?.length) {
          const message = payload.errors.map(err => err.message).filter(Boolean).join(', ');
          const extensionError = createError(
            ErrorCode.API_ERROR,
            `AniList GraphQL Error: ${message || 'Unknown error'}`,
            'AniList request failed.',
          );
          throw new AniListAbortError(extensionError);
        }
        const media = payload?.data?.Page?.media ?? [];
        return media.filter((m): m is AniMedia => Boolean(m && typeof m.id === 'number'));
      },
      'AniList request failed.',
    );
  }

  public search(search: string, limit: number): Promise<AniListSearchResult[]> {
    return this.executeGraphql<SearchMediaResponse, AniListSearchResult[]>(
      () => postAniList({ query: SEARCH_MEDIA_QUERY, variables: { search, perPage: limit } }),
      payload => {
        if (payload?.errors?.length) {
          const message = payload.errors.map(err => err.message).filter(Boolean).join(', ');
          const extensionError = createError(
            ErrorCode.API_ERROR,
            `AniList GraphQL Error: ${message || 'Unknown error'}`,
            'AniList request failed.',
          );
          throw new AniListAbortError(extensionError);
        }

        const results = payload?.data?.Page?.media ?? [];
        return results
          .filter((item): item is AniListSearchResult => typeof item?.id === 'number' && Number.isFinite(item.id))
          .map(item => ({
            id: item.id,
            title: item.title ?? {},
            coverImage: item.coverImage ?? null,
            format: item.format ?? null,
            status: item.status ?? null,
          }));
      },
      'AniList request failed.',
    );
  }

  private async executeGraphql<TPayload, TResult>(
    task: () => Promise<{ payload: TPayload; meta: AniListRequestMeta }>,
    parse: (payload: TPayload, meta: AniListRequestMeta) => TResult,
    fallbackMessage: string,
  ): Promise<TResult> {
    try {
      const response = await this.requestWithRetry(task);
      return parse(response.payload, response.meta);
    } catch (error) {
      return this.handleRequestError(error, fallbackMessage);
    }
  }

  private requestWithRetry<TPayload>(
    task: () => Promise<{ payload: TPayload; meta: AniListRequestMeta }>,
  ): Promise<{ payload: TPayload; meta: AniListRequestMeta }> {
    return withRetry(async () => {
      const response = await task();
      this.limiter.updateFromSuccess(response.meta);
      return response;
    }, {
      retries: 3,
      minTimeout: 0,
      maxTimeout: 0,
      extractRetryAfterMs: error => this.extractRetryAfterMs(error),
      onFailedAttempt: ({ error }) => this.applyRateLimitPause(error),
      shouldAbort: error => this.shouldAbortRetry(error),
    });
  }

  private extractRetryAfterMs(error: unknown): number | undefined {
    const normalized = this.unwrapAbortError(error);
    if (isRateLimitError(normalized)) {
      return Math.max(0, normalized.pausedUntil - Date.now());
    }
    return undefined;
  }

  private applyRateLimitPause(error: unknown): void {
    const normalized = this.unwrapAbortError(error);
    if (isRateLimitError(normalized)) {
      this.limiter.updateFromRateLimit(normalized.meta, normalized.pausedUntil);
    }
  }

  private shouldAbortRetry(error: unknown): boolean {
    const normalized = this.unwrapAbortError(error);
    if (isAniListAbortError(normalized)) return true;
    if (isHttpError(normalized)) {
      return normalized.isClientError && normalized.status !== 429;
    }
    return false;
  }

  private unwrapAbortError(error: unknown): unknown {
    if (error instanceof AbortError) {
      return (error as AbortError).originalError;
    }
    return error;
  }

  private handleRequestError(error: unknown, fallbackMessage: string): never {
    const normalized = this.unwrapAbortError(error);

    if (isAniListAbortError(normalized)) {
      throw normalized.extensionError;
    }

    if (isHttpError(normalized)) {
      throw createError(
        ErrorCode.API_ERROR,
        `AniList API Error: ${normalized.status}`,
        normalized.status >= 500 ? 'AniList service is temporarily unavailable.' : 'AniList request failed.',
        { status: normalized.status },
      );
    }

    if (isRateLimitError(normalized)) {
      this.limiter.updateFromRateLimit(normalized.meta, normalized.pausedUntil);
      throw createError(
        ErrorCode.API_ERROR,
        'AniList rate limit exceeded',
        'AniList request failed.',
        { retryAfterMs: Math.max(0, normalized.pausedUntil - Date.now()) },
      );
    }

    if (normalized instanceof Error) {
      const withExtension = normalized as Error & { extensionError?: ExtensionErrorLike; status?: number };
      if (withExtension.extensionError) throw withExtension.extensionError;
      if (typeof withExtension.status === 'number') {
        throw createError(
          ErrorCode.API_ERROR,
          `AniList API Error: ${withExtension.status}`,
          'AniList service is temporarily unavailable.',
          { status: withExtension.status },
        );
      }
      throw createError(ErrorCode.API_ERROR, normalized.message, fallbackMessage);
    }

    throw createError(
      ErrorCode.API_ERROR,
      'Unexpected error type in AniListExecutor.handleRequestError',
      fallbackMessage,
      { originalError: normalized }
    );
  }
}
