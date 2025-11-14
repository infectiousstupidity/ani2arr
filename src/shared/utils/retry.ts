// src/shared/utils/retry.ts
import PRetry, { AbortError } from 'p-retry';

export interface RetryOptions {
  retries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  /** Tag used for diagnostics or logging in callers. */
  tag?: string;
  /**
   * Optional hook invoked on each failed attempt after internal delay logic.
   * Use this to update caller-local state (e.g., rate-limit bookkeeping).
   */
  onFailedAttempt?: (args: { error: unknown; attemptNumber: number }) => void | Promise<void>;
  /**
   * If provided, returns an absolute millisecond duration to wait before the next retry
   * when the error contains a server-provided backoff (e.g., Retry-After header).
   */
  extractRetryAfterMs?: (error: unknown) => number | undefined;
  /**
   * Predicate to abort retries for non-retriable errors. If it returns true, the error is wrapped
   * in AbortError for p-retry to stop further attempts.
   */
  shouldAbort?: (error: unknown) => boolean;
}

/** Simple sleep helper */
const sleep = (ms: number): Promise<void> => new Promise(res => setTimeout(res, Math.max(0, ms)));

/**
 * Executes an async task with standardized retry/backoff semantics.
 * - Honors server-provided backoff via `extractRetryAfterMs` when available
 * - Otherwise applies capped exponential backoff (1s, 2s, 4s … up to 5s)
 * - Allows callers to mark certain errors as abortable via `shouldAbort`
 */
export async function withRetry<T>(task: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    retries = 3,
    minTimeout = 0,
    maxTimeout = 0,
    onFailedAttempt,
    extractRetryAfterMs,
    shouldAbort,
  } = options;

  return PRetry(
    async () => {
      try {
        return await task();
      } catch (error) {
        if (typeof shouldAbort === 'function' && shouldAbort(error)) {
          // Abort via p-retry mechanism
          throw new AbortError(error as Error);
        }
        throw error;
      }
    },
    {
      retries,
      minTimeout,
      maxTimeout,
      // We manage sleeping here to honor Retry-After precisely
      onFailedAttempt: async ({ error, attemptNumber }) => {
        try {
          let waitMs: number | undefined = undefined;
          if (typeof extractRetryAfterMs === 'function') {
            const fromHeader = extractRetryAfterMs(error);
            if (typeof fromHeader === 'number' && Number.isFinite(fromHeader) && fromHeader > 0) {
              waitMs = fromHeader;
            }
          }

          if (typeof waitMs !== 'number') {
            // Default capped exponential backoff (1s -> 5s)
            const exponential = Math.min(1000 * 2 ** (attemptNumber - 1), 5000);
            waitMs = exponential;
          }

          if (waitMs > 0) {
            await sleep(waitMs);
          }
        } finally {
          if (onFailedAttempt) {
            await onFailedAttempt({ error, attemptNumber });
          }
        }
      },
    },
  );
}

export { AbortError };

