import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { RetriableError, retryWithBackoff } from '@/utils/retry';

describe('retryWithBackoff', () => {
  let timeoutSpy: MockInstance<typeof setTimeout>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('retries transient failures until the operation succeeds', async () => {
    let attempts = 0;

    const fn = vi.fn().mockImplementation(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new RetriableError('server error', 500);
      }
      return 'ok';
    });

    const promise = retryWithBackoff(fn, { maxRetries: 5, baseDelay: 100, backoffMultiplier: 2 });

    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(timeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 100);
    expect(timeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 200);
  });

  it('stops retrying on non-retriable client errors', async () => {
    const fn = vi.fn().mockRejectedValue(new RetriableError('not found', 404));

    await expect(retryWithBackoff(fn, { maxRetries: 4, baseDelay: 50 })).rejects.toThrow('not found');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(timeoutSpy).not.toHaveBeenCalled();
  });

  it('retries rate limited responses (HTTP 429)', async () => {
    let attempts = 0;

    const fn = vi.fn().mockImplementation(async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new RetriableError('too many requests', 429);
      }
      return 'ok';
    });

    const promise = retryWithBackoff(fn, { maxRetries: 3, baseDelay: 75 });

    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('fails after exhausting the configured retry attempts', async () => {
    const error = new RetriableError('bad gateway', 502);
    const fn = vi.fn().mockRejectedValue(error);

    const promise = retryWithBackoff(fn, { maxRetries: 2, baseDelay: 60 });
    const result = promise.catch((caughtError) => caughtError);

    await vi.runAllTimersAsync();

    await expect(promise).rejects.toBe(error);
    await expect(result).resolves.toBe(error);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
