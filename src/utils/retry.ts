// src/utils/retry.ts

/**
 * @file Provides a generic retry utility with exponential backoff and jitter.
 * This is used to make network requests more resilient to temporary failures.
 */

import { logger } from '@/utils/logger';

const log = logger.create('Retry');

/**
 * Configuration options for the retry behavior.
 */
interface RetryOptions {
  /** The maximum number of retry attempts. Defaults to 3. */
  maxRetries?: number;
  /** The initial delay in milliseconds. Defaults to 1000. */
  baseDelay?: number;
  /** The maximum delay in milliseconds. Defaults to 10000. */
  maxDelay?: number;
  /** The multiplier for the delay on each retry. Defaults to 2. */
  backoffMultiplier?: number;
}

/**
 * A custom error class that can hold an HTTP status code.
 * This helps the retry logic to make smarter decisions.
 */
export class RetriableError extends Error {
  public status: number | undefined;
  public retryAfterMs: number | undefined;

  constructor(message: string, status?: number, retryAfterMs?: number) {
    super(message);
    this.name = 'RetriableError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Executes an async function and retries it with exponential backoff if it fails.
 * @param fn The async function to execute.
 * @param options Configuration for the retry behavior.
 * @returns A promise that resolves with the return value of the function if successful.
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
  } = options;

  let lastError: Error = new Error('Retry function failed to execute.');

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Do not retry on non-recoverable client-side errors (4xx range).
      // We allow retrying on 429 (Too Many Requests).
      const status = (error as RetriableError).status;
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw lastError; // Abort retry for client errors like 401, 403, 404.
      }

      // Calculate delay with jitter to prevent thundering herd problem.
      const retryAfterMs = (error as RetriableError).retryAfterMs;
      let delay: number;

      if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
        delay = retryAfterMs;
      } else {
        const base = Math.min(baseDelay * Math.pow(backoffMultiplier, attempt), maxDelay);
        delay = base + (Math.random() * (base * 0.2)); // Jitter of up to 20%
      }

      log.debug(
        `Request failed. Retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries}).`,
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // If all retries fail, throw the last captured error.
  throw lastError;
}