import { AbortError } from '@/shared/utils/retry';
import type { ReturnTypeOfCreateError } from './types';
import type { AniListRequestMeta } from './rate-limit';

export class AniListRateLimitError extends Error {
  public readonly retryAfterMs: number;
  public readonly pausedUntil: number;
  public readonly meta: AniListRequestMeta;
  public readonly status = 429;

  constructor(meta: AniListRequestMeta, pausedUntil: number) {
    super('AniList rate limit exceeded');
    this.name = 'AniListRateLimitError';
    this.meta = meta;
    this.pausedUntil = pausedUntil;
    this.retryAfterMs = Math.max(0, pausedUntil - meta.receivedAt);
  }
}

export class AniListHttpError extends Error {
  public readonly status: number;
  public readonly meta?: AniListRequestMeta;

  constructor(status: number, message?: string, meta?: AniListRequestMeta) {
    super(message ?? `AniList API Error: ${status}`);
    this.name = 'AniListHttpError';
    this.status = status;
    if (meta) {
      this.meta = meta;
    }
  }

  public get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

export class AniListAbortError extends AbortError {
  public readonly extensionError: ReturnTypeOfCreateError;

  constructor(extensionError: ReturnTypeOfCreateError) {
    super(new Error(extensionError.message));
    this.extensionError = extensionError;
  }
}

export const isRateLimitError = (error: unknown): error is AniListRateLimitError =>
  error instanceof AniListRateLimitError ||
  (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { retryAfterMs?: unknown }).retryAfterMs === 'number' &&
    typeof (error as { pausedUntil?: unknown }).pausedUntil === 'number'
  );

export const isHttpError = (error: unknown): error is AniListHttpError =>
  error instanceof AniListHttpError ||
  (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { status?: unknown }).status === 'number' &&
    (error as { name?: unknown }).name === 'AniListHttpError'
  );

export const isAniListAbortError = (error: unknown): error is AniListAbortError =>
  error instanceof AniListAbortError;
