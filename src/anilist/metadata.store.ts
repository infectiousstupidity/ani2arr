/** AniList metadata hydration, refresh, and persistence workflow for domain-owned metadata state. */
// src/anilist/metadata.store.ts

import { isAniListId, type AniListId } from '@/anilist/anilist-id';
import type { AniListMedia } from '@/anilist/schemas/media.schema';
import type { AniListMetadata } from '@/anilist/schemas/metadata.schema';
import { logError, normalizeError } from '@/shared/errors';
import { createTtlCache, type TtlCache } from '@/shared/cache/ttl-cache';
import {
  bakedMetadataStore,
  type BakedMetadataStore,
} from './baked-metadata.store';
import {
  normalizeMetadataEntry,
  normalizeTitles,
} from './metadata-normalization';
import type { AniListMediaService } from './media.service';

const days = (n: number): number => n * 24 * 60 * 60 * 1000;

const METADATA_OVERLAY_CACHE_NAMESPACE = 'anilist:metadata-overlay';
const METADATA_OVERLAY_STALE_MS = days(45);
const METADATA_OVERLAY_HARD_MS = days(120);
const MAX_REFRESH_BATCH = 10;

const metadataOverlayCache = createTtlCache<AniListMetadata>(METADATA_OVERLAY_CACHE_NAMESPACE);

const clampBatch = (ids: AniListId[], maxBatch?: number): AniListId[] => {
  const limit = Math.max(1, Math.min(maxBatch ?? MAX_REFRESH_BATCH, MAX_REFRESH_BATCH));
  return ids.slice(0, limit);
};

export class AniListMetadataStore {
  private readonly localMap = new Map<AniListId, AniListMetadata>();
  private readonly inflight = new Map<AniListId, Promise<AniListMetadata | null>>();
  private readonly ready: Promise<void>;

  constructor(
    private readonly anilistApi: AniListMediaService,
    private readonly overlayCache: TtlCache<AniListMetadata> = metadataOverlayCache,
    private readonly bakedStore: BakedMetadataStore = bakedMetadataStore,
  ) {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    try {
      await this.bakedStore.syncFromBundleManifest();
    } catch (error) {
      logError(normalizeError(error), 'AniListMetadataStore:init:fetchStatic');
    }
  }

  private fromMedia(media: AniListMedia): AniListMetadata {
    const cover = media.coverImage ?? null;
    const coverImage = cover
      ? {
          medium: cover.medium ?? null,
          large: cover.large ?? cover.extraLarge ?? null,
        }
      : null;

    return {
      id: media.id,
      titles: normalizeTitles(media.title),
      seasonYear: media.seasonYear ?? media.startDate?.year ?? null,
      format: media.format ?? null,
      coverImage,
      updatedAt: Date.now(),
    };
  }

  private isStale(entry: AniListMetadata, now: number): boolean {
    return now - entry.updatedAt >= METADATA_OVERLAY_STALE_MS;
  }

  private async readOverlay(id: AniListId): Promise<AniListMetadata | null> {
    const local = this.localMap.get(id);
    if (local) return local;
    try {
      const cached = await this.overlayCache.read(String(id));
      if (!cached) return null;
      const normalized = normalizeMetadataEntry({ ...cached.value, id });
      if (!normalized) return null;
      this.localMap.set(id, normalized);
      return normalized;
    } catch (error) {
      logError(normalizeError(error), 'AniListMetadataStore:readOverlay');
      return null;
    }
  }

  private async writeOverlay(entries: AniListMetadata[]): Promise<void> {
    try {
      await Promise.all(
        entries.map(entry =>
          this.overlayCache.write(String(entry.id), entry, {
            staleMs: METADATA_OVERLAY_STALE_MS,
            hardMs: METADATA_OVERLAY_HARD_MS,
          }),
        ),
      );
    } catch (error) {
      logError(normalizeError(error), 'AniListMetadataStore:writeOverlay');
    }
  }

  private async bestFor(id: AniListId): Promise<AniListMetadata | null> {
    const local = await this.readOverlay(id);
    if (local) return local;
    return this.bakedStore.get(id);
  }

  private async refreshBatch(ids: AniListId[]): Promise<AniListMetadata[]> {
    const unique = [...new Set(ids.filter(isAniListId))];
    if (unique.length === 0) return [];

    const pending: AniListId[] = [];
    for (const id of unique) {
      if (this.inflight.has(id)) continue;
      pending.push(id);
    }
    if (pending.length === 0) {
      const awaited = await Promise.all(unique.map(id => this.inflight.get(id)));
      return awaited.filter(Boolean) as AniListMetadata[];
    }

    const limited = clampBatch(pending);
    const batchPromise = this.anilistApi
      .fetchMediaBatch(limited, {
        priority: 'low',
        forceRefresh: true,
        source: 'metadata-refresh',
      })
      .then(mediaMap => {
        const refreshed: AniListMetadata[] = [];
        for (const [id, media] of mediaMap.entries()) {
          const entry = this.fromMedia(media);
          this.localMap.set(id, entry);
          refreshed.push(entry);
        }
        if (refreshed.length > 0) {
          void this.writeOverlay(refreshed);
        }
        return refreshed;
      })
      .catch(error => {
        logError(normalizeError(error), 'AniListMetadataStore:refreshBatch');
        return [] as AniListMetadata[];
      });

    for (const id of limited) {
      this.inflight.set(
        id,
        batchPromise
          .then(entries => entries.find(e => e.id === id) ?? null)
          .finally(() => {
            this.inflight.delete(id);
          }),
      );
    }

    return batchPromise;
  }

  public async getMetadata(
    ids: AniListId[],
    options?: { refreshStale?: boolean; maxBatch?: number; fetchMissing?: boolean },
  ): Promise<{ metadata: AniListMetadata[]; missingIds?: AniListId[] }> {
    await this.ready;
    const refreshStale = options?.refreshStale ?? true;
    const maxBatch = options?.maxBatch;
    const fetchMissing = options?.fetchMissing ?? true;
    const now = Date.now();
    const metadata = new Map<AniListId, AniListMetadata>();
    const refreshIds: AniListId[] = [];
    const validIds = ids.filter(isAniListId);
    const entries = await Promise.all(
      validIds.map(async id => [id, await this.bestFor(id)] as const),
    );

    for (const [id, entry] of entries) {
      if (entry) {
        metadata.set(id, entry);
        if (refreshStale && this.isStale(entry, now) && !this.inflight.has(id)) {
          refreshIds.push(id);
        }
      } else if (fetchMissing) {
        refreshIds.push(id);
      }
    }

    const clampedRefresh = clampBatch(refreshIds, maxBatch);
    if (clampedRefresh.length > 0) {
      const refreshed = await this.refreshBatch(clampedRefresh);
      for (const entry of refreshed) {
        metadata.set(entry.id, entry);
      }
    }

    const missingIds = ids.filter(id => isAniListId(id) && !metadata.has(id));

    return {
      metadata: [...metadata.values()],
      ...(missingIds.length > 0 ? { missingIds } : {}),
    };
  }

  public async clearLocalCache(): Promise<void> {
    await this.ready;
    this.localMap.clear();
    this.inflight.clear();

    try {
      await Promise.all([this.overlayCache.clear(), this.bakedStore.clear()]);
    } catch (error) {
      logError(normalizeError(error), 'AniListMetadataStore:clearLocalCache');
      throw error;
    }
  }
}
