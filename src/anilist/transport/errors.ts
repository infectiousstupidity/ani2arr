/** Transport error types for AniList HTTP and rate-limit failures. */
// src/anilist/transport/errors.ts

import type { AniListResponseMeta } from '@/anilist/transport/types';

export interface AniListGraphQLError {
  message: string;
  status?: number | undefined;
}

export class AniListGraphqlError extends Error {
  public readonly errors: AniListGraphQLError[];

  constructor(errors: AniListGraphQLError[]) {
    const message = errors.map(error => error.message).filter(Boolean).join(', ') || 'Unknown AniList GraphQL error';
    super(`AniList GraphQL Error: ${message}`);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'AniListGraphqlError';
    this.errors = errors;
  }
}

export class AniListRateLimitError extends Error {
  public readonly retryAfterMs: number;
  public readonly pausedUntil: number;
  public readonly meta: AniListResponseMeta;
  public readonly status = 429;

  constructor(meta: AniListResponseMeta, pausedUntil: number) {
    super('AniList rate limit exceeded');
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'AniListRateLimitError';
    this.meta = meta;
    this.pausedUntil = pausedUntil;
    this.retryAfterMs = Math.max(0, pausedUntil - meta.receivedAt);
  }
}

export class AniListHttpError extends Error {
  public readonly status: number;
  public readonly meta?: AniListResponseMeta;

  constructor(status: number, message?: string, meta?: AniListResponseMeta) {
    super(message ?? `AniList API Error: ${status}`);
    Object.setPrototypeOf(this, new.target.prototype);
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

export const isRateLimitError = (error: unknown): error is AniListRateLimitError =>
  error instanceof AniListRateLimitError;

export const isHttpError = (error: unknown): error is AniListHttpError =>
  error instanceof AniListHttpError;

export const isGraphqlError = (error: unknown): error is AniListGraphqlError =>
  error instanceof AniListGraphqlError;
