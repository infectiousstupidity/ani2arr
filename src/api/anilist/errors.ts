import { AbortError } from '@/shared/utils/retry';
import type { ReturnTypeOfCreateError } from './types';

export class AniListRateLimitError extends Error {
  public readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super('AniList rate limit exceeded');
    this.name = 'AniListRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class AniListHttpError extends Error {
  public readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? `AniList API Error: ${status}`);
    this.name = 'AniListHttpError';
    this.status = status;
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
  (typeof error === 'object' && error !== null && typeof (error as { retryAfterMs?: unknown }).retryAfterMs === 'number');

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
