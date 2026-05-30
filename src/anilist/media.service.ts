/** Public AniList domain workflow for media fetches, caching, search, and relation traversal. */
// src/anilist/media.service.ts

import PQueue from 'p-queue';
import type { AniListId } from './anilist-id';
import { isAniListId } from '@/anilist/anilist-id';
import type { AniListMedia } from '@/anilist/schemas/media.schema';
import {
  isGraphqlError,
  isHttpError,
  isRateLimitError,
} from '@/anilist/transport/errors';
import { fetchAniListMediaBatch } from '@/anilist/transport/media';
import type { TtlCache } from '@/shared/cache/ttl-cache';
import { createError, ErrorCode } from '@/shared/errors';
import { logger } from '@/shared/utils/logger';
import type { RequestPriority } from '@/shared/utils/request-priority';
import { priorityValue } from '@/shared/utils/request-priority';
import { AbortError, withRetry } from '@/shared/utils/retry';
import { DEFAULT_PREQUEL_DEPTH, MAX_BATCH_SIZE, QUEUE_CONCURRENCY } from './constants';
import { cacheMedia } from './media-normalizer';

export interface RequestMediaOptions {
  priority?: RequestPriority;
  forceRefresh?: boolean;
  source?: string;
}

type NormalizedRequestMediaOptions = Required<RequestMediaOptions>;

export class AniListMediaService {
  private readonly log = logger.create('AniListMediaService');
  private readonly queue = new PQueue({ concurrency: QUEUE_CONCURRENCY });
  private readonly caches: { media: TtlCache<AniListMedia> } | undefined;
  private readonly inflight = new Map<AniListId, Promise<AniListMedia>>();

  constructor(caches?: { media: TtlCache<AniListMedia> }) {
    this.caches = caches;
  }

  public prioritize(ids: AniListId | AniListId[], options?: { schedule?: boolean }): void {
    if (options?.schedule !== true) return;

    const list = Array.isArray(ids) ? ids : [ids];
    void this
      .fetchMediaBatch(list, {
        priority: 'high',
        source: 'priority-warm',
      })
      .catch(() => {});
  }

  public fetchMediaWithRelations(
    anilistId: AniListId,
    options?: { priority?: RequestPriority; forceRefresh?: boolean; source?: string },
  ): Promise<AniListMedia> {
    if (!isAniListId(anilistId)) {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        `Invalid AniList ID ${String(anilistId)}`,
        'AniList request failed.',
      );
    }

    return this.fetchMediaBatch([anilistId], {
      source: options?.source ?? 'media-detail',
      priority: options?.priority ?? 'normal',
      ...(options?.forceRefresh === true ? { forceRefresh: true } : {}),
    }).then(mediaMap => {
      const media = mediaMap.get(anilistId);
      if (media) return media;

      throw this.createMissingMediaError(anilistId);
    });
  }

  public async *iteratePrequelChain(
    seed: AniListMedia,
    options: { includeRoot?: boolean; maxDepth?: number } = {},
  ): AsyncGenerator<AniListMedia> {
    const includeRoot = options.includeRoot ?? false;
    const maxDepth = options.maxDepth ?? DEFAULT_PREQUEL_DEPTH;

    const visited = new Set<AniListId>();
    let depth = 0;
    let current: AniListMedia | null = seed ?? null;

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

      const nextMedia = await this.fetchMediaWithRelations(nextId, {
        priority: 'normal',
        source: 'prequel-chain',
      });
      yield nextMedia;
      visited.add(nextId);
      current = nextMedia;
      depth += 1;
    }
  }

  public async removeMediaFromCache(anilistId: AniListId): Promise<void> {
    const cache = this.caches?.media;
    if (!cache) return;

    try {
      await cache.remove(String(anilistId));
    } catch {
      // best-effort eviction
    }
  }

  public async fetchMediaBatch(
    ids: AniListId[],
    options?: { priority?: RequestPriority; forceRefresh?: boolean; source?: string },
  ): Promise<Map<AniListId, AniListMedia>> {
    const requestOptions = this.normalizeOptions({
      source: options?.source ?? 'media-batch',
      priority: options?.priority ?? 'low',
      ...(options?.forceRefresh === true ? { forceRefresh: true } : {}),
    });
    const uniqueIds = this.normalizeIds(ids);
    const results = new Map<AniListId, AniListMedia>();
    const pending = new Map<AniListId, Promise<AniListMedia>>();
    const networkIds: AniListId[] = [];
    const cacheResults = requestOptions.forceRefresh
      ? uniqueIds.map(id => [id, null] as const)
      : await Promise.all(
          uniqueIds.map(async id => [id, await this.readCachedMedia(id)] as const),
        );

    for (const [id, cached] of cacheResults) {
      if (cached) {
        results.set(id, cached.media);
        if (cached.stale) {
          this.refreshInBackground(id, requestOptions);
        }
        continue;
      }

      const inflight = this.inflight.get(id);
      if (inflight) {
        pending.set(id, inflight);
        continue;
      }

      networkIds.push(id);
    }

    for (const [id, promise] of this.scheduleNetworkRequests(networkIds, requestOptions)) {
      pending.set(id, promise);
    }

    if (pending.size === 0) {
      return results;
    }

    const settled = await Promise.allSettled(
      [...pending.entries()].map(async ([queuedId, promise]) => [queuedId, await promise] as const),
    );

    const rejected: unknown[] = [];
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        const [resolvedId, media] = outcome.value;
        results.set(resolvedId, media);
      } else {
        rejected.push(outcome.reason);
      }
    }

    if (rejected.length > 0 && results.size === 0) {
      throw rejected[0];
    }

    return results;
  }

  private extractPrequelId(media: AniListMedia): AniListId | null {
    const edges = media.relations?.edges ?? [];
    const prequelEdge = edges.find(edge => edge?.relationType === 'PREQUEL');
    if (!prequelEdge) return null;

    const id = prequelEdge.node?.id;
    return id ?? null;
  }

  private normalizeOptions(options: RequestMediaOptions): NormalizedRequestMediaOptions {
    return {
      priority: options.priority ?? 'normal',
      forceRefresh: options.forceRefresh === true,
      source: options.source?.trim() || 'unknown',
    };
  }

  private normalizeIds(ids: AniListId[]): AniListId[] {
    return [...new Set(ids.filter(isAniListId))];
  }

  private async readCachedMedia(
    id: AniListId,
  ): Promise<{ media: AniListMedia; stale: boolean } | null> {
    const cache = this.caches?.media;
    if (!cache) return null;

    const hit = await cache.read(String(id));
    if (!hit) return null;

    return {
      media: hit.value,
      stale: hit.stale,
    };
  }

  private refreshInBackground(
    id: AniListId,
    options: NormalizedRequestMediaOptions,
  ): void {
    const [promise] = this.scheduleNetworkRequests([id], {
      ...options,
      forceRefresh: true,
      source: `${options.source}:refresh`,
    }).values();

    void promise?.catch(error => {
      this.log.warn(`background refresh failed for AniList ID ${id}`, error);
    });
  }

  private scheduleNetworkRequests(
    ids: AniListId[],
    options: NormalizedRequestMediaOptions,
  ): Map<AniListId, Promise<AniListMedia>> {
    const requests = new Map<AniListId, Promise<AniListMedia>>();
    const networkIds: AniListId[] = [];

    for (const id of ids) {
      const inflight = this.inflight.get(id);
      if (inflight) {
        requests.set(id, inflight);
        continue;
      }

      networkIds.push(id);
    }

    for (const chunk of this.chunkIds(networkIds)) {
      const chunkPromise = this.queue.add(
        () => this.fetchAndCacheChunk(chunk, options),
        { priority: priorityValue(options.priority) },
      );

      for (const id of chunk) {
        const mediaPromise = chunkPromise.then(mediaMap => {
          const media = mediaMap.get(id);
          if (media) return media;
          throw this.createMissingMediaError(id);
        }).finally(() => {
          this.clearInflight(id, mediaPromise);
        });

        this.inflight.set(id, mediaPromise);
        requests.set(id, mediaPromise);
      }
    }

    return requests;
  }

  private chunkIds(ids: AniListId[]): AniListId[][] {
    const chunks: AniListId[][] = [];
    for (let index = 0; index < ids.length; index += MAX_BATCH_SIZE) {
      chunks.push(ids.slice(index, index + MAX_BATCH_SIZE));
    }
    return chunks;
  }

  private clearInflight(id: AniListId, promise: Promise<AniListMedia>): void {
    if (this.inflight.get(id) === promise) {
      this.inflight.delete(id);
    }
  }

  private async fetchAndCacheChunk(
    ids: AniListId[],
    options: NormalizedRequestMediaOptions,
  ): Promise<Map<AniListId, AniListMedia>> {
    if (import.meta.env.DEV) {
      this.log.debug?.(
        `anilist:media-service fetch priority=${options.priority} sent=${ids.length} source=${options.source}`,
      );
    }

    const medias = await this.fetchBatch(ids);
    const requestedIds = new Set(ids);
    const entries = await Promise.all(
      medias.flatMap(media => {
        if (!isAniListId(media.id) || !requestedIds.has(media.id)) return [];

        return [
          cacheMedia(this.caches?.media, media.id, media)
            .then(cached => [media.id, cached] as const),
        ];
      }),
    );

    return new Map(entries);
  }

  private createMissingMediaError(id: AniListId) {
    return createError(
      ErrorCode.API_ERROR,
      `AniList response missing media for ${id}`,
      'AniList returned an unexpected response.',
    );
  }

  private fetchBatch(ids: AniListId[]): Promise<AniListMedia[]> {
    return withRetry(
      async () => {
        const response = await fetchAniListMediaBatch(ids);
        return response.data;
      },
      {
        retries: 3,
        minTimeout: 0,
        maxTimeout: 0,
        extractRetryAfterMs: error => this.extractRetryAfterMs(error),
        shouldAbort: error => this.shouldAbortRetry(error),
      },
    ).catch(error => this.handleRequestError(error));
  }

  private extractRetryAfterMs(error: unknown): number | undefined {
    const normalized = this.unwrapAbortError(error);
    if (isRateLimitError(normalized)) {
      return Math.max(0, normalized.pausedUntil - Date.now());
    }
    return undefined;
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

  private handleRequestError(error: unknown): never {
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
        normalized.status >= 500
          ? 'AniList service is temporarily unavailable.'
          : 'AniList request failed.',
        { status: normalized.status },
      );
    }

    if (isRateLimitError(normalized)) {
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
      throw createError(
        ErrorCode.API_ERROR,
        normalized.message,
        'AniList request failed.',
      );
    }

    throw createError(
      ErrorCode.API_ERROR,
      'Unexpected error type in AniListMediaService.handleRequestError',
      'AniList request failed.',
      { originalError: normalized },
    );
  }
}
