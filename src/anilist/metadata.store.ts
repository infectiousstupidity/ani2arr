/** AniList metadata hydration, refresh, and persistence workflow for domain-owned metadata state. */
// src/anilist/metadata.store.ts

import { browser } from 'wxt/browser';
import * as v from 'valibot';
import type {
  AniListMedia,
  AniListTitles,
} from '@/anilist/schemas/media.schema';
import { isAniListId, type AniListId } from '@/anilist/anilist-id';
import { AniListMetadataBundleSchema, AniListMetadataChunkRefSchema, AniListMetadataSchema } from '@/anilist/schemas/metadata.schema';
import type { AniListMetadata } from '@/anilist/schemas/metadata.schema';
import { logError, normalizeError } from '@/shared/errors';
import { createTtlCache, type TtlCache } from '@/shared/cache/ttl-cache';
import { logger } from '@/shared/utils/logger';
import {
  RawAniListMetadataBundleSchema,
  RawAniListMetadataEntrySchema,
} from './metadata-store.schema';
import type { AniListMediaService } from './media.service';

type AniListMetadataChunkRef = v.InferOutput<typeof AniListMetadataChunkRefSchema>;
type AniListMetadataBundle = v.InferOutput<typeof AniListMetadataBundleSchema>;

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

const normalizeTitles = (titles?: AniListTitles | null): AniListTitles => {
  if (!titles) return {};
  const normalized: AniListTitles = {};
  if (titles.english) normalized.english = titles.english;
  if (titles.romaji) normalized.romaji = titles.romaji;
  if (titles.native) normalized.native = titles.native;
  return normalized;
};

export class AniListMetadataStore {
  private readonly log = logger.create('AniListMetadataStore');
  private readonly bakedMap = new Map<AniListId, AniListMetadata>();
  private readonly localMap = new Map<AniListId, AniListMetadata>();
  private readonly inflight = new Map<AniListId, Promise<AniListMetadata | null>>();
  private readonly ready: Promise<void>;

  constructor(
    private readonly anilistApi: AniListMediaService,
    private readonly overlayCache: TtlCache<AniListMetadata> = metadataOverlayCache,
  ) {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    try {
      const response = await fetch(this.toBakedUrl('anilist-static-metadata.json'));
      if (response.ok) {
        const bundle = this.parseMetadataBundle(await response.json());
        await this.loadBakedMetadata(bundle);
      } else {
        this.log.warn(
          `loadBakedBundle: failed to load static metadata (status ${response.status})`,
        );
      }
    } catch (error) {
      logError(normalizeError(error), 'AniListMetadataStore:init:fetchStatic');
    }
  }

  private toBakedUrl(file: string): string {
    const getRuntimeUrl = browser.runtime.getURL as (path: string) => string;
    return getRuntimeUrl(`/${file}`);
  }

  private async loadBakedMetadata(bundle: AniListMetadataBundle | null | undefined): Promise<void> {
    if (!bundle) {
      this.log.warn('loadBakedMetadata: missing bundle');
      return;
    }

    if (Array.isArray(bundle.entries)) {
      this.loadBakedBundle(bundle);
      return;
    }

    if (!Array.isArray(bundle.chunks) || bundle.chunks.length === 0) {
      this.log.warn('loadBakedMetadata: missing chunk manifest');
      return;
    }

    const generatedAt = bundle.generatedAt;

    const settled = await Promise.allSettled(
      bundle.chunks.map(chunk => this.fetchBakedChunk(chunk, generatedAt)),
    );

    let loadedChunks = 0;
    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value) {
        this.loadBakedBundle(result.value);
        loadedChunks += 1;
      } else if (result.status === 'rejected') {
        logError(normalizeError(result.reason), 'AniListMetadataStore:loadBakedChunk');
      }
    }

    this.log.debug(
      `loadBakedMetadata: loaded ${this.bakedMap.size} entries from ${loadedChunks}/${bundle.chunks.length} chunks`,
    );
  }

  private async fetchBakedChunk(
    chunk: AniListMetadataChunkRef,
    generatedAt: number,
  ): Promise<AniListMetadataBundle | null> {
    if (!chunk || typeof chunk.file !== 'string' || chunk.file.length === 0) {
      return null;
    }

    const response = await fetch(this.toBakedUrl(chunk.file));
    if (!response.ok) {
      throw new Error(`Failed to load baked chunk ${chunk.file} (${response.status})`);
    }

    return this.parseMetadataBundle(await response.json(), generatedAt);
  }

  private loadBakedBundle(bundle: AniListMetadataBundle | null | undefined): void {
    if (!bundle || !Array.isArray(bundle.entries)) {
      this.log.warn('loadBakedBundle: missing or invalid bundle');
      return;
    }
    for (const entry of bundle.entries) {
      this.bakedMap.set(entry.id, entry);
    }
    this.log.debug(`loadBakedBundle: loaded ${this.bakedMap.size} entries`);
  }

  private normalizeEntry(raw: unknown, fallbackUpdatedAt = Date.now()): AniListMetadata | null {
    const result = v.safeParse(RawAniListMetadataEntrySchema, raw);
    if (!result.success) return null;

    const entry = result.output;
    if (!entry.id) return null;

    const normalized = {
      id: entry.id,
      titles: normalizeTitles(entry.titles ?? {}),
      seasonYear: entry.seasonYear ?? null,
      format: entry.format ?? null,
      coverImage: entry.coverImage
        ? {
            medium: entry.coverImage.medium ?? null,
            large: entry.coverImage.large ?? null,
          }
        : null,
      updatedAt:
        typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)
          ? entry.updatedAt
          : fallbackUpdatedAt,
    };

    const parsedMetadata = v.safeParse(AniListMetadataSchema, normalized);
    return parsedMetadata.success ? parsedMetadata.output : null;
  }

  private parseMetadataBundle(raw: unknown, fallbackGeneratedAt?: number): AniListMetadataBundle | null {
    const result = v.safeParse(RawAniListMetadataBundleSchema, raw);
    if (!result.success) {
      return null;
    }

    const generatedAt = fallbackGeneratedAt ?? result.output.generatedAt;
    const entries = result.output.entries
      .map(entry => this.normalizeEntry(entry, generatedAt))
      .filter((entry): entry is AniListMetadata => entry !== null);
    const chunks = result.output.chunks
      .map(chunk => {
        const parsedChunk = v.safeParse(AniListMetadataChunkRefSchema, chunk);
        return parsedChunk.success ? parsedChunk.output : null;
      })
      .filter((chunk): chunk is AniListMetadataChunkRef => chunk !== null);

    const parsedBundle = v.safeParse(AniListMetadataBundleSchema, {
      generatedAt,
      ...(entries.length > 0 ? { entries } : {}),
      ...(chunks.length > 0 ? { chunks } : {}),
    });
    return parsedBundle.success ? parsedBundle.output : null;
  }

  private fromMedia(media: AniListMedia): AniListMetadata | null {
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
      const normalized = this.normalizeEntry({ ...cached.value, id });
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
    return this.bakedMap.get(id) ?? null;
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
          if (entry) {
            this.localMap.set(id, entry);
            refreshed.push(entry);
          }
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

    for (const id of ids) {
      if (!isAniListId(id)) continue;
      const entry = await this.bestFor(id);
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
      await this.overlayCache.clear();
    } catch (error) {
      logError(normalizeError(error), 'AniListMetadataStore:clearLocalCache');
      throw error;
    }
  }
}
