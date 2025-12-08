// src/api/anilist.api.ts
import PQueue from 'p-queue';
import { withRetry, AbortError } from '@/shared/utils/retry';
import type { TtlCache } from '@/cache';
import { createError, ErrorCode } from '@/shared/utils/error-handling';
import { logger } from '@/shared/utils/logger';
import type { AniMedia, AniListSearchResult, RequestPriority } from '@/shared/types';
import { priorityValue } from '@/shared/utils/priority';

const API_URL = 'https://graphql.anilist.co';
const QUEUE_CONCURRENCY = 1;
const MEDIA_SOFT_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days
const MEDIA_HARD_TTL = 60 * 24 * 60 * 60 * 1000; // 60 days
const DEFAULT_PREQUEL_DEPTH = 5;
const DEFAULT_RATE_LIMIT_DELAY_MS = 5_000;

// Single media fetch query
const FIND_MEDIA_QUERY = `
  query FindMedia($id: Int) {
    Media(id: $id) {
      id
      format
      title { romaji english native }
      startDate { year }
      synonyms
      description(asHtml: false)
      episodes
      duration
      nextAiringEpisode {
        episode
        airingAt
      }
      relations {
        edges {
          relationType
          node {
            id
          }
        }
      }
      bannerImage
      coverImage {
        extraLarge
        large
        medium
        color
      }
      status
      season
      seasonYear
      genres
      studios(isMain: true) {
        nodes {
          name
        }
      }
    }
  }
`;

// Batch query for up to 50 IDs at once
const FIND_MEDIA_BATCH_QUERY = `
  query FindMediaBatch($ids: [Int!]) {
    Page(perPage: 50) {
      media(id_in: $ids, type: ANIME) {
        id
        format
        title { romaji english native }
        startDate { year }
        synonyms
        description(asHtml: false)
        episodes
        duration
        nextAiringEpisode {
          episode
          airingAt
        }
        relations {
          edges {
            relationType
            node { id }
          }
        }
        bannerImage
        coverImage {
          extraLarge
          large
          medium
          color
        }
        status
        season
        seasonYear
        genres
        studios(isMain: true) {
          nodes {
            name
          }
        }
      }
    }
  }
`;

type FindMediaResponse = {
  data?: { Media?: AniMedia };
  errors?: { message: string; status: number }[];
};

type FindMediaBatchResponse = {
  data?: { Page?: { media?: AniMedia[] } };
  errors?: { message: string; status: number }[];
};

type ExtensionErrorLike = ReturnType<typeof createError>;
type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

export class AnilistApiService {
  private readonly log = logger.create('AniListApiService');
  private readonly queue = new PQueue({
    concurrency: QUEUE_CONCURRENCY,
  });
  private readonly inflight = new Map<number, { promise: Promise<AniMedia>; kind: 'single' | 'batch'; token?: number }>();
  private readonly caches: { media: TtlCache<AniMedia> } | undefined;
  private pausedUntil: number = 0;
  private readonly tokens = new Map<number, number>();
  private readonly batchRunningIds = new Set<number>();
  private readonly pausedByPriority = new Map<RequestPriority, Map<number, { deferred: Deferred<AniMedia>; token: number }>>();
  private pausedFlushTimer: ReturnType<typeof setTimeout> | null = null;

  private hasCompleteMediaFields(media: AniMedia | null | undefined): media is AniMedia {
    if (!media) return false;
    const cover = media.coverImage;
    // We strictly check for cover presence to validate "completeness"
    const hasCover =
      !!cover &&
      ((typeof cover.extraLarge === 'string' && cover.extraLarge.trim().length > 0) ||
        (typeof cover.large === 'string' && cover.large.trim().length > 0) ||
          (typeof cover.medium === 'string' && cover.medium.trim().length > 0));

    return hasCover;
  }

  private normalizeMedia(media: AniMedia): AniMedia {
    const cover = media.coverImage ?? null;
    return {
      ...media,
      // Pass through new fields
      description: media.description ?? null,
      episodes: media.episodes ?? null,
      duration: media.duration ?? null,
      nextAiringEpisode: media.nextAiringEpisode ?? null,
      bannerImage: media.bannerImage ?? null,
      coverImage: cover
        ? {
            extraLarge: cover.extraLarge ?? null,
            large: cover.large ?? null,
            medium: cover.medium ?? null,
            color: cover.color ?? null,
          }
        : null,
      title: media.title ?? {},
      synonyms: Array.isArray(media.synonyms) ? [...media.synonyms] : [],
    };
  }

  private sanitizeMedia(media: AniMedia): AniMedia {
    try {
      return JSON.parse(JSON.stringify(media)) as AniMedia;
    } catch {
      return media;
    }
  }

  private async cacheMedia(id: number, media: AniMedia): Promise<AniMedia> {
    const normalized = this.normalizeMedia(media);
    const sanitized = this.sanitizeMedia(normalized);
    const cache = this.caches?.media;
    if (!cache) return sanitized;

    try {
      await cache.write(String(id), sanitized, {
        staleMs: MEDIA_SOFT_TTL,
        hardMs: MEDIA_HARD_TTL,
        meta: { cachedAt: Date.now() },
      });
    } catch (error) {
      const name = (error as { name?: string } | null | undefined)?.name ?? '';
      if (name === 'DataCloneError') {
        this.log.warn(`cache:media DataCloneError id=${id}; skipping cache write`);
        return sanitized;
      }
      throw error;
    }

    return sanitized;
  }

  constructor(caches?: { media: TtlCache<AniMedia> }) {
    this.caches = caches;
  }

  private createDeferred<T>(): Deferred<T> {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  private bumpToken(id: number): number {
    const next = (this.tokens.get(id) ?? 0) + 1;
    this.tokens.set(id, next);
    return next;
  }
  private currentToken(id: number): number {
    return this.tokens.get(id) ?? 0;
  }
  private normalizePriority(priority?: RequestPriority): RequestPriority {
    return priority ?? 'normal';
  }

  private getPausedBucket(priority: RequestPriority): Map<number, { deferred: Deferred<AniMedia>; token: number }> {
    let bucket = this.pausedByPriority.get(priority);
    if (!bucket) {
      bucket = new Map();
      this.pausedByPriority.set(priority, bucket);
    }
    return bucket;
  }

  private schedulePausedFlush(): void {
    if (this.pausedFlushTimer) {
      clearTimeout(this.pausedFlushTimer);
      this.pausedFlushTimer = null;
    }

    const delay = Math.max(0, this.pausedUntil - Date.now());
    this.pausedFlushTimer = setTimeout(() => {
      this.pausedFlushTimer = null;
      void this.flushPausedQueue();
    }, delay);
  }

  public prioritize(ids: number | number[], options?: { schedule?: boolean }): void {
    const list = Array.isArray(ids) ? ids : [ids];
    const schedule = options?.schedule === true;
    for (const id of list) {
      const prev = this.currentToken(id);
      const next = this.bumpToken(id);
      if (import.meta.env.DEV) {
        this.log.debug?.(`prio:bump id=${id} token_old=${prev} token_new=${next} schedule=${String(schedule)}`);
      }
      if (schedule) {
        void this.enqueueAndCache(id, { priority: 'high' }).catch(() => {});
      }
    }
  }

  private enqueueWhilePaused(anilistId: number, priority: RequestPriority): Promise<AniMedia> {
    const bucket = this.getPausedBucket(priority);
    const existing = bucket.get(anilistId);
    if (existing) return existing.deferred.promise;

    const deferred = this.createDeferred<AniMedia>();
    const token = priority === 'high' ? this.bumpToken(anilistId) : this.currentToken(anilistId);
    bucket.set(anilistId, { deferred, token });
    this.inflight.set(anilistId, { promise: deferred.promise, kind: 'batch', token });
    this.schedulePausedFlush();
    return deferred.promise;
  }

  private async flushPausedQueue(): Promise<void> {
    if (this.pausedUntil > Date.now()) {
      this.schedulePausedFlush();
      return;
    }

    const priorities: RequestPriority[] = ['high', 'normal', 'low'];
    for (const priority of priorities) {
      const bucket = this.pausedByPriority.get(priority);
      if (!bucket || bucket.size === 0) continue;

      const entries = Array.from(bucket.entries());
      bucket.clear();

      const active: Array<{ id: number; deferred: Deferred<AniMedia>; token: number }> = [];
      for (const [id, entry] of entries) {
        const current = this.currentToken(id);
        if (current !== entry.token) {
          entry.deferred.reject(
            createError(ErrorCode.API_ERROR, `AniList request preempted for ${id}`, 'Request superseded.', {
              preempted: true,
            }),
          );
          const inflight = this.inflight.get(id);
          if (inflight && inflight.promise === entry.deferred.promise) {
            this.inflight.delete(id);
          }
          continue;
        }
        active.push({ id, deferred: entry.deferred, token: entry.token });
      }

      if (active.length === 0) continue;

      for (let i = 0; i < active.length; i += 50) {
        const chunk = active.slice(i, i + 50);
        await this.runPausedChunk(priority, chunk);
      }
    }
  }

  private async runPausedChunk(
    priority: RequestPriority,
    entries: Array<{ id: number; deferred: Deferred<AniMedia>; token: number }>,
  ): Promise<void> {
    if (entries.length === 0) return;

    const prio = priorityValue(priority);
    const ids = entries.map(entry => entry.id);
    const entryById = new Map<number, { deferred: Deferred<AniMedia>; token: number }>();
    for (const entry of entries) entryById.set(entry.id, { deferred: entry.deferred, token: entry.token });

    const run = async () => {
      for (const id of ids) this.batchRunningIds.add(id);
      try {
        if (ids.length === 1) {
          const [firstId] = ids;
          const single = firstId !== undefined ? await this.executeFetch(firstId) : null;
          return single ? [single] : [];
        }
        return await this.executeBatch(ids);
      } finally {
        for (const id of ids) this.batchRunningIds.delete(id);
      }
    };

    let medias: AniMedia[];
    try {
      medias = (await this.queue.add(() => run(), { priority: prio })) as AniMedia[];
    } catch (error) {
      for (const { id, deferred } of entries) {
        deferred.reject(error);
        const inflight = this.inflight.get(id);
        if (inflight && inflight.promise === deferred.promise) {
          this.inflight.delete(id);
        }
      }
      return;
    }

    const resolved = new Set<number>();
    for (const media of medias) {
      if (!media || typeof media.id !== 'number') continue;
      const cached = await this.cacheMedia(media.id, media);
      resolved.add(media.id);
      const target = entryById.get(media.id);
      if (target) {
        target.deferred.resolve(cached);
        const inflight = this.inflight.get(media.id);
        if (inflight && inflight.promise === target.deferred.promise) {
          this.inflight.delete(media.id);
        }
      }
    }

    for (const { id, deferred } of entries) {
      if (resolved.has(id)) continue;
      deferred.reject(
        createError(
          ErrorCode.API_ERROR,
          `AniList response missing media for ${id}`,
          'AniList returned an unexpected response.',
        ),
      );
      const inflight = this.inflight.get(id);
      if (inflight && inflight.promise === deferred.promise) {
        this.inflight.delete(id);
      }
    }
  }

  public fetchMediaWithRelations(
    anilistId: number,
    options?: { priority?: RequestPriority; forceRefresh?: boolean },
  ): Promise<AniMedia> {
    if (options?.forceRefresh) {
      return this.enqueueAndCache(anilistId, options);
    }

    const cache = this.caches?.media;
    if (cache) {
      return (async () => {
        const hit = await cache.read(String(anilistId));
        if (hit) {
          const isComplete = this.hasCompleteMediaFields(hit.value);
          if (import.meta.env.DEV) {
            this.log.debug?.(
              `cache:media id=${anilistId} hit stale=${String(hit.stale)} staleAt=${hit.staleAt} expiresAt=${hit.expiresAt} complete=${String(isComplete)}`,
            );
          }
          if (isComplete) {
            const normalized = this.normalizeMedia(hit.value);
            if (hit.stale) {
              void this.enqueueAndCache(anilistId, options).catch(error => {
                this.log.warn(`background refresh failed for AniList ID ${anilistId}`, error);
              });
            }
            return this.sanitizeMedia(normalized);
          }
          void cache.remove(String(anilistId)).catch(() => {});
        }
        return this.enqueueAndCache(anilistId, options);
      })();
    }

    return this.enqueueAndCache(anilistId, options);
  }

  public async *iteratePrequelChain(
    seed: AniMedia,
    options: { includeRoot?: boolean; maxDepth?: number } = {},
  ): AsyncGenerator<AniMedia> {
    const includeRoot = options.includeRoot ?? false;
    const maxDepth = options.maxDepth ?? DEFAULT_PREQUEL_DEPTH;

    const visited = new Set<number>();
    let depth = 0;
    let current: AniMedia | null = seed ?? null;

    if (!current) return;

    if (includeRoot && !visited.has(current.id)) {
      visited.add(current.id);
      yield current;
    } else {
      visited.add(current.id);
    }

    while (current && (maxDepth < 0 || depth < maxDepth)) {
      const nextId = this.extractPrequelId(current);
      if (nextId === null || visited.has(nextId)) {
        break;
      }

      const nextMedia = await this.fetchMediaWithRelations(nextId);
      yield nextMedia;
      visited.add(nextId);
      current = nextMedia;
      depth += 1;
    }
  }

  public async removeMediaFromCache(anilistId: number): Promise<void> {
    const cache = this.caches?.media;
    if (!cache) return;
    try {
      await cache.remove(String(anilistId));
    } catch {
      // best-effort eviction
    }
  }

  public async fetchMediaBatch(ids: number[]): Promise<Map<number, AniMedia>> {
    const uniqueIds = Array.from(new Set(ids.filter(id => typeof id === 'number' && Number.isFinite(id)))) as number[];
    const results = new Map<number, AniMedia>();
    if (uniqueIds.length === 0) return results;

    const cache = this.caches?.media;
    const freshMisses: number[] = [];

    if (cache) {
      for (const id of uniqueIds) {
        const hit = await cache.read(String(id));
        if (hit) {
          const isComplete = this.hasCompleteMediaFields(hit.value);
          if (isComplete) {
            results.set(id, this.normalizeMedia(hit.value));
            if (hit.stale) {
              void this.enqueueAndCache(id).catch(() => {});
            }
            continue;
          }
          void cache.remove(String(id)).catch(() => {});
        }
        freshMisses.push(id);
      }
    } else {
      freshMisses.push(...uniqueIds);
    }

    if (freshMisses.length === 0) return results;

    const pendingIds = freshMisses.filter(id => !this.inflight.has(id));
    const chunks: number[][] = [];
    for (let i = 0; i < pendingIds.length; i += 50) {
      chunks.push(pendingIds.slice(i, i + 50));
    }

    for (const chunk of chunks) {
      if (chunk.length === 0) continue;

      const deferredById = new Map<number, { promise: Promise<AniMedia>; resolve: (v: AniMedia) => void; reject: (r?: unknown) => void }>();
      const scheduledTokenById = new Map<number, number>();
      for (const id of chunk) {
        const d = this.createDeferred<AniMedia>();
        deferredById.set(id, d);
        const token = this.currentToken(id);
        scheduledTokenById.set(id, token);
        this.inflight.set(id, { promise: d.promise, kind: 'batch', token });
      }

      const now = Date.now();
      if (this.pausedUntil > now) {
        await new Promise(resolve => setTimeout(resolve, this.pausedUntil - now));
      }

      try {
        const prio = priorityValue('low');
        const handled = new Set<number>();
        const medias = await this.queue.add(
          async () => {
            const finalIds: number[] = [];
            const dropped: Array<{ id: number; reason: 'preempted' | 'not-batch' | 'cached' }> = [];

            for (const id of chunk) {
              const scheduledToken = scheduledTokenById.get(id) ?? 0;
              const nowToken = this.currentToken(id);
              const d = deferredById.get(id);
              const infl = this.inflight.get(id);

              if (nowToken !== scheduledToken) {
                dropped.push({ id, reason: 'preempted' });
                if (d) d.reject(createError(ErrorCode.API_ERROR, `AniList request preempted for ${id}`, 'Request superseded.', { preempted: true }));
                handled.add(id);
                continue;
              }

              if (!infl || infl.kind !== 'batch' || infl.promise !== d?.promise) {
                dropped.push({ id, reason: 'not-batch' });
                if (d) d.reject(createError(ErrorCode.API_ERROR, `AniList request preempted for ${id}`, 'Request superseded.', { preempted: true }));
                handled.add(id);
                continue;
              }

              const cache = this.caches?.media;
              if (cache) {
                try {
                  const hit = await cache.read(String(id));
                  if (hit && !hit.stale) {
                    results.set(id, hit.value);
                    if (d) d.resolve(hit.value);
                    const cur = this.inflight.get(id);
                    if (cur && cur.kind === 'batch' && cur.promise === d?.promise) {
                      this.inflight.delete(id);
                    }
                    dropped.push({ id, reason: 'cached' });
                    handled.add(id);
                    continue;
                  }
                } catch {
                   // ignore
                }
              }
              finalIds.push(id);
            }

            if (finalIds.length === 0) {
              return [] as AniMedia[];
            }

            for (const id of finalIds) this.batchRunningIds.add(id);
            try {
              return await this.executeBatch(finalIds);
            } finally {
              for (const id of finalIds) this.batchRunningIds.delete(id);
            }
          },
          { priority: prio },
        ) as AniMedia[];

        for (const media of medias) {
          if (!media || typeof media.id !== 'number') continue;
          const cachedMedia = await this.cacheMedia(media.id, media);
          results.set(media.id, cachedMedia);
          const d = deferredById.get(media.id);
          if (d) {
            d.resolve(cachedMedia);
          }
          const cur = this.inflight.get(media.id);
          if (cur && cur.kind === 'batch' && cur.promise === d?.promise) {
            this.inflight.delete(media.id);
          }
        }

        for (const id of chunk) {
          if (!results.has(id) && !handled.has(id)) {
            const d = deferredById.get(id);
            if (d) {
              d.reject(
                createError(
                  ErrorCode.API_ERROR,
                  `AniList response missing media for ${id}`,
                  'AniList returned an unexpected response.',
                ),
              );
            }
            const cur = this.inflight.get(id);
            if (cur && cur.kind === 'batch' && cur.promise === d?.promise) {
              this.inflight.delete(id);
            }
          }
        }
      } catch (error) {
        for (const id of chunk) {
          const d = deferredById.get(id);
          if (d) {
            d.reject(error);
          }
          const cur = this.inflight.get(id);
          if (cur && cur.kind === 'batch' && cur.promise === d?.promise) {
            this.inflight.delete(id);
          }
        }
        throw error;
      }
    }

    return results;
  }

  private async enqueueAndCache(
    anilistId: number,
    options?: { priority?: RequestPriority },
  ): Promise<AniMedia> {
    const priority = this.normalizePriority(options?.priority);
    const existing = this.inflight.get(anilistId);
    if (existing) {
      const wantsHigh = priority === 'high';
      if (existing.kind === 'batch' && wantsHigh) {
        if (this.batchRunningIds.has(anilistId)) {
          return existing.promise;
        } else {
          // continue to schedule a high-priority single
        }
      } else {
        return existing.promise;
      }
    }

    const now = Date.now();
    if (this.pausedUntil > now) {
      return this.enqueueWhilePaused(anilistId, priority);
    }

    const wantsHigh = priority === 'high';
    const scheduledToken = wantsHigh ? this.bumpToken(anilistId) : this.currentToken(anilistId);
    const prio = priorityValue(priority);

    const queuePromise = this.queue.add(
      () => {
        return this.executeFetch(anilistId);
      },
      { priority: prio },
    ) as Promise<AniMedia>;
    
    const promise = queuePromise
      .then(async media => {
        return await this.cacheMedia(anilistId, media);
      })
      .finally(() => {
        this.inflight.delete(anilistId);
      });

    this.inflight.set(anilistId, { promise, kind: 'single', token: scheduledToken });
    return promise;
  }

  private async executeFetch(anilistId: number): Promise<AniMedia> {
    try {
      return await withRetry(
        async () => {
          const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ query: FIND_MEDIA_QUERY, variables: { id: anilistId } }),
          });

          if (!response.ok) {
            if (response.status === 429) {
              const retryAfter = this.parseRetryAfterTs(response.headers.get('Retry-After'));
              const delay = retryAfter ? Math.max(0, retryAfter - Date.now()) : DEFAULT_RATE_LIMIT_DELAY_MS;
              this.pausedUntil = Date.now() + delay;
              const error = new Error('Rate limit exceeded');
              (error as { retryAfterMs?: number }).retryAfterMs = delay;
              throw error;
            }
            if (response.status >= 400 && response.status < 500) {
              const extensionError = createError(ErrorCode.API_ERROR, `AniList API Error: ${response.status}`, 'AniList request failed.', { status: response.status });
              throw new AbortError(Object.assign(new Error(extensionError.message), { extensionError }));
            }
            throw Object.assign(new Error(`AniList API Error: ${response.status}`), { status: response.status });
          }

          const payload = (await response.json()) as FindMediaResponse;
          const media = payload?.data?.Media;

          if (!media) {
             // Error handling
             if (payload?.errors?.length) {
               const message = payload.errors.map(err => err.message).join(', ');
               const extensionError = createError(ErrorCode.API_ERROR, `AniList GraphQL Error: ${message}`, 'AniList request failed.');
               throw new AbortError(Object.assign(new Error(extensionError.message), { extensionError }));
             }
             const extensionError = createError(ErrorCode.API_ERROR, `AniList response missing media for ${anilistId}`, 'AniList returned an unexpected response.');
             throw new AbortError(Object.assign(new Error(extensionError.message), { extensionError }));
          }

          return media;
        },
        {
          retries: 3,
          minTimeout: 0,
          maxTimeout: 0,
          extractRetryAfterMs: (e: unknown) => (e as { retryAfterMs?: number })?.retryAfterMs,
        },
      );
    } catch (error) {
      if (error instanceof AbortError) {
        const original = error.originalError as Error & { extensionError?: ExtensionErrorLike };
        if (original?.extensionError) throw original.extensionError;
        throw createError(ErrorCode.API_ERROR, original?.message ?? error.message, 'AniList request failed.');
      }
      if (error instanceof Error) {
        const withExtension = error as Error & { extensionError?: ExtensionErrorLike };
        if (withExtension.extensionError) throw withExtension.extensionError;
        const { status } = error as Error & { status?: unknown };
        if (typeof status === 'number') {
          throw createError(ErrorCode.API_ERROR, `AniList API Error: ${status}`, 'AniList service is temporarily unavailable.', { status });
        }
      }
      throw error;
    }
  }

  private async executeBatch(ids: number[]): Promise<AniMedia[]> {
    try {
      return await withRetry(
        async () => {
          const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ query: FIND_MEDIA_BATCH_QUERY, variables: { ids } }),
          });

          if (!response.ok) {
            if (response.status === 429) {
              const retryAfter = this.parseRetryAfterTs(response.headers.get('Retry-After'));
              const delay = retryAfter ? Math.max(0, retryAfter - Date.now()) : DEFAULT_RATE_LIMIT_DELAY_MS;
              this.pausedUntil = Date.now() + delay;
              const error = new Error('Rate limit exceeded');
              (error as { retryAfterMs?: number }).retryAfterMs = delay;
              throw error;
            }
            if (response.status >= 400 && response.status < 500) {
              const extensionError = createError(ErrorCode.API_ERROR, `AniList API Error: ${response.status}`, 'AniList request failed.', { status: response.status });
              throw new AbortError(Object.assign(new Error(extensionError.message), { extensionError }));
            }
             throw Object.assign(new Error(`AniList API Error: ${response.status}`), { status: response.status });
          }

          const payload = (await response.json()) as FindMediaBatchResponse;
          const media = payload?.data?.Page?.media ?? [];
          return media.filter((m): m is AniMedia => Boolean(m && typeof m.id === 'number'));
        },
        {
          retries: 3,
          minTimeout: 0,
          maxTimeout: 0,
          extractRetryAfterMs: (e: unknown) => (e as { retryAfterMs?: number })?.retryAfterMs,
        },
      );
    } catch (error) {
       // Same error handling logic as executeFetch
       if (error instanceof AbortError) {
        const original = error.originalError as Error & { extensionError?: ExtensionErrorLike };
        if (original?.extensionError) throw original.extensionError;
        throw createError(ErrorCode.API_ERROR, original?.message ?? error.message, 'AniList request failed.');
      }
      if (error instanceof Error) {
        const withExtension = error as Error & { extensionError?: ExtensionErrorLike };
        if (withExtension.extensionError) throw withExtension.extensionError;
        const { status } = error as Error & { status?: unknown };
        if (typeof status === 'number') {
           throw createError(ErrorCode.API_ERROR, `AniList API Error: ${status}`, 'AniList service is temporarily unavailable.', { status });
        }
      }
      throw error;
    }
  }

  private extractPrequelId(media: AniMedia): number | null {
    const edges = media.relations?.edges ?? [];
    const prequelEdge = edges.find(edge => edge?.relationType === 'PREQUEL');
    if (!prequelEdge) return null;
    const id = prequelEdge.node?.id;
    return typeof id === 'number' && Number.isFinite(id) ? id : null;
  }

  private parseRetryAfterTs(header: string | null): number | null {
    if (!header) return null;
    const numeric = Number(header);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Date.now() + numeric * 1000;
    }
    const parsed = Date.parse(header);
    return Number.isNaN(parsed) ? null : Math.max(Date.now(), parsed);
  }

  public async searchMedia(search: string, options?: { limit?: number }): Promise<AniListSearchResult[]> {
    const term = search.trim();
    if (!term) return [];
    const limit = Math.min(Math.max(options?.limit ?? 8, 1), 25);

    const run = async () => {
      const now = Date.now();
      if (this.pausedUntil > now) {
        await new Promise(resolve => setTimeout(resolve, this.pausedUntil - now));
      }
      return this.executeSearch(term, limit);
    };

    return this.queue.add(() => run(), { priority: priorityValue('normal') }) as Promise<AniListSearchResult[]>;
  }

  private async executeSearch(search: string, limit: number): Promise<AniListSearchResult[]> {
    const SEARCH_QUERY = `
      query SearchAnime($search: String!, $perPage: Int!) {
        Page(perPage: $perPage) {
          media(search: $search, type: ANIME) {
            id
            title { english romaji native }
            coverImage { large medium }
            format
            status
          }
        }
      }
    `;

    try {
      const results = await withRetry(
        async () => {
          const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ query: SEARCH_QUERY, variables: { search, perPage: limit } }),
          });

          if (!response.ok) {
            if (response.status === 429) {
              const retryAfter = this.parseRetryAfterTs(response.headers.get('Retry-After'));
              const delay = retryAfter ? Math.max(0, retryAfter - Date.now()) : DEFAULT_RATE_LIMIT_DELAY_MS;
              this.pausedUntil = Date.now() + delay;
              const error = new Error('Rate limit exceeded');
              (error as { retryAfterMs?: number }).retryAfterMs = delay;
              throw error;
            }
            if (response.status >= 400 && response.status < 500) {
              const extensionError = createError(
                ErrorCode.API_ERROR,
                `AniList API Error: ${response.status}`,
                'AniList request failed.',
                { status: response.status },
              );
              throw new AbortError(Object.assign(new Error(extensionError.message), { extensionError }));
            }
            throw Object.assign(new Error(`AniList API Error: ${response.status}`), { status: response.status });
          }

          const payload = (await response.json()) as {
            data?: { Page?: { media?: AniListSearchResult[] } };
          };
          return payload?.data?.Page?.media ?? [];
        },
        {
          retries: 3,
          minTimeout: 0,
          maxTimeout: 0,
          extractRetryAfterMs: (e: unknown) => (e as { retryAfterMs?: number })?.retryAfterMs,
        },
      );

      return results
        .filter((item): item is AniListSearchResult => typeof item?.id === 'number' && Number.isFinite(item.id))
        .map(item => ({
          id: item.id,
          title: item.title ?? {},
          coverImage: item.coverImage ?? null,
          format: item.format ?? null,
          status: item.status ?? null,
        }));
    } catch (error) {
      if (error instanceof AbortError) {
        const original = error.originalError as Error & { extensionError?: ExtensionErrorLike };
        if (original?.extensionError) throw original.extensionError;
        throw createError(ErrorCode.API_ERROR, original?.message ?? error.message, 'AniList request failed.');
      }
      if (error instanceof Error) {
        const withExtension = error as Error & { extensionError?: ExtensionErrorLike };
        if (withExtension.extensionError) throw withExtension.extensionError;
        const { status } = error as Error & { status?: unknown };
        if (typeof status === 'number') {
          throw createError(
            ErrorCode.API_ERROR,
            `AniList API Error: ${status}`,
            'AniList service is temporarily unavailable.',
            { status },
          );
        }
      }
      throw error;
    }
  }
}
