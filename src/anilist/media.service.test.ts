/** Focused tests for AniList media service cache, dedupe, and error behavior. */
// src/anilist/media.service.test.ts

import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAniListId, type AniListId } from '@/anilist/anilist-id';
import type { AniListMedia } from '@/anilist/schemas/media.schema';
import { AniListRateLimitError } from '@/anilist/transport/errors';
import type { AniListResponseMeta } from '@/anilist/transport/types';
import type { CacheHit, CacheWriteOptions, TtlCache } from '@/shared/cache/ttl-cache';
import { ErrorCode } from '@/shared/errors';

const { fetchAniListMediaBatchMock } = vi.hoisted(() => ({
  fetchAniListMediaBatchMock: vi.fn(),
}));

vi.mock('@/anilist/transport/media', () => ({
  fetchAniListMediaBatch: fetchAniListMediaBatchMock,
}));

import { AniListMediaService } from './media.service';

type MemoryCache<T> = TtlCache<T> & {
  peek(key: string): CacheHit<T> | null;
  set(key: string, value: T, stale?: boolean): void;
};

const createMeta = (receivedAt = Date.now()): AniListResponseMeta => ({
  status: 200,
  rateLimit: {
    limit: 100,
    remaining: 99,
    resetAt: null,
    retryAfterMs: null,
  },
  receivedAt,
});

const createMedia = (id: AniListId, title = `Media ${id}`): AniListMedia => ({
  id,
  format: 'TV',
  title: { romaji: title },
  synonyms: [],
  coverImage: {
    extraLarge: null,
    large: `https://img.example.test/${id}.jpg`,
    medium: null,
    color: null,
  },
});

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const createMemoryCache = <T>(): MemoryCache<T> => {
  const entries = new Map<string, CacheHit<T>>();

  const put = (key: string, value: T, stale: boolean): void => {
    const now = Date.now();
    entries.set(key, {
      value,
      stale,
      staleAt: stale ? now - 1 : now + 60_000,
      expiresAt: now + 120_000,
    });
  };

  return {
    async read(key: string): Promise<CacheHit<T> | null> {
      return entries.get(key) ?? null;
    },
    async write(
      key: string,
      value: T,
      options: CacheWriteOptions,
    ): Promise<void> {
      const now = Date.now();
      entries.set(key, {
        value,
        stale: false,
        staleAt: now + options.staleMs,
        expiresAt: now + (options.hardMs ?? options.staleMs * 4),
        ...(options.meta ? { meta: options.meta } : {}),
      });
    },
    async remove(key: string): Promise<void> {
      entries.delete(key);
    },
    async clear(): Promise<void> {
      entries.clear();
    },
    peek(key: string): CacheHit<T> | null {
      return entries.get(key) ?? null;
    },
    set(key: string, value: T, stale = false): void {
      put(key, value, stale);
    },
  };
};

afterEach(() => {
  vi.useRealTimers();
  fetchAniListMediaBatchMock.mockReset();
});

describe('AniListMediaService', () => {
  it('shares concurrent duplicate single-ID requests', async () => {
    const id = parseAniListId(101);
    const pending = createDeferred<{ data: AniListMedia[]; meta: AniListResponseMeta }>();
    fetchAniListMediaBatchMock.mockReturnValue(pending.promise);
    const service = new AniListMediaService();

    const first = service.fetchMediaWithRelations(id);
    const second = service.fetchMediaWithRelations(id);

    await vi.waitFor(() => {
      expect(fetchAniListMediaBatchMock).toHaveBeenCalledTimes(1);
    });
    pending.resolve({ data: [createMedia(id)], meta: createMeta() });

    await expect(first).resolves.toMatchObject({ id });
    await expect(second).resolves.toMatchObject({ id });
  });

  it('dedupes batch IDs before transport fetch', async () => {
    const id = parseAniListId(202);
    fetchAniListMediaBatchMock.mockResolvedValue({
      data: [createMedia(id)],
      meta: createMeta(),
    });
    const service = new AniListMediaService();

    const result = await service.fetchMediaBatch([id, id], { forceRefresh: true });

    expect(fetchAniListMediaBatchMock).toHaveBeenCalledWith([id]);
    expect(result.get(id)?.id).toBe(id);
  });

  it('returns fresh cache hits without transport fetch', async () => {
    const id = parseAniListId(303);
    const cache = createMemoryCache<AniListMedia>();
    cache.set(String(id), {
      ...createMedia(id, 'Cached'),
      coverImage: null,
    });
    const service = new AniListMediaService({ media: cache });

    const result = await service.fetchMediaBatch([id]);

    expect(result.get(id)).toMatchObject({ id, title: { romaji: 'Cached' } });
    expect(fetchAniListMediaBatchMock).not.toHaveBeenCalled();
  });

  it('returns stale cache hits and refreshes them in background', async () => {
    const id = parseAniListId(404);
    const cache = createMemoryCache<AniListMedia>();
    cache.set(String(id), createMedia(id, 'Stale'), true);
    fetchAniListMediaBatchMock.mockResolvedValue({
      data: [createMedia(id, 'Fresh')],
      meta: createMeta(),
    });
    const service = new AniListMediaService({ media: cache });

    const result = await service.fetchMediaBatch([id]);

    expect(result.get(id)).toMatchObject({ id, title: { romaji: 'Stale' } });
    await vi.waitFor(() => {
      expect(fetchAniListMediaBatchMock).toHaveBeenCalledTimes(1);
      expect(cache.peek(String(id))?.value).toMatchObject({
        title: { romaji: 'Fresh' },
      });
    });
  });

  it('returns partial successes and throws only when all misses fail', async () => {
    const firstId = parseAniListId(501);
    const missingId = parseAniListId(502);
    const allMissingId = parseAniListId(503);
    fetchAniListMediaBatchMock
      .mockResolvedValueOnce({
        data: [createMedia(firstId)],
        meta: createMeta(),
      })
      .mockResolvedValueOnce({
        data: [],
        meta: createMeta(),
      });
    const service = new AniListMediaService();

    const partial = await service.fetchMediaBatch([firstId, missingId], {
      forceRefresh: true,
      priority: 'normal',
    });

    expect(partial.size).toBe(1);
    expect(partial.get(firstId)?.id).toBe(firstId);
    await expect(
      service.fetchMediaBatch([allMissingId], {
        forceRefresh: true,
        priority: 'normal',
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.API_ERROR,
      message: `AniList response missing media for ${allMissingId}`,
    });
  });

  it('maps rate-limit errors to the project API error shape', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    const id = parseAniListId(601);
    const meta = createMeta(1000);
    fetchAniListMediaBatchMock.mockRejectedValue(
      new AniListRateLimitError(meta, 1010),
    );
    const service = new AniListMediaService();

    const request = service.fetchMediaBatch([id], { forceRefresh: true });
    const expectation = expect(request).rejects.toMatchObject({
      code: ErrorCode.API_ERROR,
      message: 'AniList rate limit exceeded',
      details: { retryAfterMs: expect.any(Number) },
    });
    await vi.runAllTimersAsync();

    await expectation;
  });
});
