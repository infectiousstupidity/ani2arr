/** Public AniList domain workflow for media fetches, caching, search, and relation traversal. */
// src/core/anilist/media.service.ts

import PQueue from 'p-queue';
import type { TtlCache } from '@/storage';
import type { AniListSearchMediaDto } from '@/integrations/anilist/media.schema';
import type { AniListMedia } from '@/shared/schemas/anilist/anilist-media.schema';
import type { RequestPriority } from '@/shared/utils/request-priority';
import { DEFAULT_PREQUEL_DEPTH, QUEUE_CONCURRENCY } from './constants';
import { AniListMediaScheduler, type RequestMediaOptions } from './media-scheduler';

export class AniListMediaService {
  private readonly queue = new PQueue({ concurrency: QUEUE_CONCURRENCY });
  private readonly caches: { media: TtlCache<AniListMedia> } | undefined;
  private readonly mediaScheduler: AniListMediaScheduler;

  constructor(caches?: { media: TtlCache<AniListMedia> }) {
    this.caches = caches;
    this.mediaScheduler = new AniListMediaScheduler({
      dispatchTask: (task, priority) => this.queue.add(task, { priority }),
      ...(caches?.media ? { cache: caches.media } : {}),
    });
  }

  public prioritize(ids: number | number[], options?: { schedule?: boolean }): void {
    this.mediaScheduler.prioritize(ids, 'high');

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
    anilistId: number,
    options?: { priority?: RequestPriority; forceRefresh?: boolean; source?: string },
  ): Promise<AniListMedia> {
    const requestOptions: RequestMediaOptions = {
      source: options?.source ?? 'media-detail',
      ...(options?.priority ? { priority: options.priority } : {}),
      ...(options?.forceRefresh === true ? { forceRefresh: true } : {}),
    };

    return this.mediaScheduler.requestSingle(anilistId, requestOptions);
  }

  public async *iteratePrequelChain(
    seed: AniListMedia,
    options: { includeRoot?: boolean; maxDepth?: number } = {},
  ): AsyncGenerator<AniListMedia> {
    const includeRoot = options.includeRoot ?? false;
    const maxDepth = options.maxDepth ?? DEFAULT_PREQUEL_DEPTH;

    const visited = new Set<number>();
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

  public async removeMediaFromCache(anilistId: number): Promise<void> {
    const cache = this.caches?.media;
    if (!cache) return;

    try {
      await cache.remove(String(anilistId));
    } catch {
      // best-effort eviction
    }
  }

  public fetchMediaBatch(
    ids: number[],
    options?: { priority?: RequestPriority; forceRefresh?: boolean; source?: string },
  ): Promise<Map<number, AniListMedia>> {
    const requestOptions: RequestMediaOptions = {
      source: options?.source ?? 'media-batch',
      priority: options?.priority ?? 'low',
      ...(options?.forceRefresh === true ? { forceRefresh: true } : {}),
    };

    return this.mediaScheduler.requestMedia(ids, requestOptions);
  }

  public async searchMedia(search: string, options?: { limit?: number }): Promise<AniListSearchMediaDto[]> {
    const term = search.trim();
    if (!term) return [];

    const limit = Math.min(Math.max(options?.limit ?? 8, 1), 25);
    return this.mediaScheduler.searchMedia(term, limit);
  }

  private extractPrequelId(media: AniListMedia): number | null {
    const edges = media.relations?.edges ?? [];
    const prequelEdge = edges.find(edge => edge?.relationType === 'PREQUEL');
    if (!prequelEdge) return null;

    const id = prequelEdge.node?.id;
    return typeof id === 'number' && Number.isFinite(id) ? id : null;
  }
}
