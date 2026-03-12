import PQueue from 'p-queue';
import type { TtlCache } from '@/cache';
import type { AniMedia, AniListSearchResult, RequestPriority } from '@/shared/types';
import { logger } from '@/shared/utils/logger';
import { priorityValue } from '@/shared/utils/priority';
import { DEFAULT_PREQUEL_DEPTH, QUEUE_CONCURRENCY } from './constants';
import { AniListExecutor } from './executor';
import { AniListMediaScheduler, type RequestMediaOptions } from './media-scheduler';
import { AniListRateLimiter } from './rate-limit';

export class AnilistApiService {
  private readonly log = logger.create('AniListApiService');
  private readonly queue = new PQueue({ concurrency: QUEUE_CONCURRENCY });
  private readonly caches: { media: TtlCache<AniMedia> } | undefined;
  private readonly limiter = new AniListRateLimiter();
  private readonly executor: AniListExecutor;
  private readonly mediaScheduler: AniListMediaScheduler;

  constructor(caches?: { media: TtlCache<AniMedia> }) {
    this.caches = caches;
    this.executor = new AniListExecutor({
      limiter: this.limiter,
    });
    this.mediaScheduler = new AniListMediaScheduler({
      executor: this.executor,
      limiter: this.limiter,
      dispatchTask: (task, priority) => this.queue.add(task, { priority }),
      ...(this.caches?.media ? { cache: this.caches.media } : {}),
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
  ): Promise<AniMedia> {
    const requestOptions: RequestMediaOptions = {
      source: options?.source ?? 'media-detail',
      ...(options?.priority ? { priority: options.priority } : {}),
      ...(options?.forceRefresh === true ? { forceRefresh: true } : {}),
    };

    return this.mediaScheduler.requestSingle(anilistId, requestOptions);
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
  ): Promise<Map<number, AniMedia>> {
    const requestOptions: RequestMediaOptions = {
      source: options?.source ?? 'media-batch',
      priority: options?.priority ?? 'low',
      ...(options?.forceRefresh === true ? { forceRefresh: true } : {}),
    };

    return this.mediaScheduler.requestMedia(ids, requestOptions);
  }

  public async searchMedia(search: string, options?: { limit?: number }): Promise<AniListSearchResult[]> {
    const term = search.trim();
    if (!term) return [];

    const limit = Math.min(Math.max(options?.limit ?? 8, 1), 25);

    return this.queue.add(async () => {
      await this.waitForLimiterWindow('normal');
      return this.executor.search(term, limit);
    }, { priority: priorityValue('normal') });
  }

  private async waitForLimiterWindow(priority: RequestPriority): Promise<void> {
    while (true) {
      const nextAt = this.limiter.nextDispatchAt(priority);
      const delay = nextAt - Date.now();
      if (delay <= 0) {
        return;
      }

      if (import.meta.env.DEV) {
        this.log.debug?.(`anilist:limiter wait priority=${priority} delayMs=${delay}`);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  private extractPrequelId(media: AniMedia): number | null {
    const edges = media.relations?.edges ?? [];
    const prequelEdge = edges.find(edge => edge?.relationType === 'PREQUEL');
    if (!prequelEdge) return null;

    const id = prequelEdge.node?.id;
    return typeof id === 'number' && Number.isFinite(id) ? id : null;
  }
}
