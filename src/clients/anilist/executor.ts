/** Applies retry and app-level error translation around AniList integration requests. */
// src/clients/anilist/executor.ts

import { withRetry, AbortError } from '@/shared/utils/retry';
import { createError, ErrorCode } from '@/shared/errors/error-utils';
import type { AniListMedia } from '@/shared/types';
import {
  isGraphqlError,
  isHttpError,
  isRateLimitError,
} from '@/integrations/anilist/errors';
import {
  fetchAniListMediaBatch,
  searchAniListMedia,
} from '@/integrations/anilist/media';
import type {
  AniListResponseMeta,
  AniListSearchMediaDto,
} from '@/integrations/anilist/types';
import type { AniListRateLimiter } from './rate-limit';

type ExecutorDeps = {
  limiter: AniListRateLimiter;
};

export class AniListExecutor {
  private readonly limiter: ExecutorDeps['limiter'];

  constructor(deps: ExecutorDeps) {
    this.limiter = deps.limiter;
  }

  public fetchBatch(ids: number[]): Promise<AniListMedia[]> {
    return this.executeRequest(() => fetchAniListMediaBatch(ids), 'AniList request failed.');
  }

  public search(search: string, limit: number): Promise<AniListSearchMediaDto[]> {
    return this.executeRequest(() => searchAniListMedia(search, limit), 'AniList request failed.');
  }

  private async executeRequest<TResult>(
    task: () => Promise<{ data: TResult; meta: AniListResponseMeta }>,
    fallbackMessage: string,
  ): Promise<TResult> {
    try {
      const response = await this.requestWithRetry(task);
      return response.data;
    } catch (error) {
      return this.handleRequestError(error, fallbackMessage);
    }
  }

  private requestWithRetry<TResult>(
    task: () => Promise<{ data: TResult; meta: AniListResponseMeta }>,
  ): Promise<{ data: TResult; meta: AniListResponseMeta }> {
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
    if (isGraphqlError(normalized)) return true;
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

    if (isGraphqlError(normalized)) {
      throw createError(
        ErrorCode.API_ERROR,
        normalized.message,
        'AniList request failed.',
      );
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
      const withStatus = normalized as Error & { status?: number };
      if (typeof withStatus.status === 'number') {
        throw createError(
          ErrorCode.API_ERROR,
          `AniList API Error: ${withStatus.status}`,
          'AniList service is temporarily unavailable.',
          { status: withStatus.status },
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
