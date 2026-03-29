/** AniList metadata hydration, refresh, and persistence workflow for domain-owned metadata state. */
// src/core/anilist/metadata.store.ts

import { browser } from 'wxt/browser';
import * as v from 'valibot';
import type {
  AniListMetadata,
  AniListMetadataBundle,
  AniListMetadataChunkRef,
  AniListMedia,
  AniListTitles,
} from '@/shared/types';
import { AniListMetadataBundleSchema, AniListMetadataChunkRefSchema, AniListMetadataSchema } from '@/shared/schemas/anilist/anilist-metadata.schema';
import { logError, normalizeError } from '@/shared/errors';
import { logger } from '@/shared/utils/logger';
import {
  RawAniListMetadataBundleSchema,
  RawAniListMetadataEntrySchema,
  RawAniListMetadataRecordSchema,
} from './metadata.schema';
import type { AniListMediaService } from './media.service';

const days = (n: number): number => n * 24 * 60 * 60 * 1000;

const STORAGE_KEY = 'local:anilistMetadata';
const BAKED_STALE_MS = days(45); // 45 days
const BAKED_HARD_MS = days(120); // 120 days
const MAX_REFRESH_BATCH = 10;

type PersistedRecord = Record<string, AniListMetadata>;

const clampBatch = (ids: number[], maxBatch?: number): number[] => {
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
  private readonly bakedMap = new Map<number, AniListMetadata>();
  private readonly localMap = new Map<number, AniListMetadata>();
  private readonly inflight = new Map<number, Promise<AniListMetadata | null>>();
  private readonly ready: Promise<void>;

  constructor(private readonly anilistApi: AniListMediaService) {
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
    await this.hydrateLocal();
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
    if (typeof entry.id !== 'number' || !Number.isFinite(entry.id)) return null;

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

  private async hydrateLocal(): Promise<void> {
    try {
      const stored = await browser.storage.local.get(STORAGE_KEY);
      const recordResult = v.safeParse(RawAniListMetadataRecordSchema, stored?.[STORAGE_KEY]);
      if (!recordResult.success) return;

      const now = Date.now();
      for (const [key, value] of Object.entries(recordResult.output)) {
        const id = Number(key);
        if (!Number.isFinite(id)) continue;
        const normalized = this.normalizeEntry({ ...(typeof value === 'object' && value ? value : {}), id });
        if (!normalized) continue;
        if (now - normalized.updatedAt > BAKED_HARD_MS) continue;
        this.localMap.set(id, normalized);
      }
      this.log.debug(`hydrateLocal: loaded ${this.localMap.size} refreshed entries`);
    } catch (error) {
      logError(normalizeError(error), 'AniListMetadataStore:hydrateLocal');
    }
  }

  private async persistLocal(): Promise<void> {
    const payload: PersistedRecord = {};
    for (const [id, entry] of this.localMap.entries()) {
      payload[id] = entry;
    }
    try {
      await browser.storage.local.set({ [STORAGE_KEY]: payload });
    } catch (error) {
      logError(normalizeError(error), 'AniListMetadataStore:persistLocal');
    }
  }

  private fromMedia(media: AniListMedia): AniListMetadata | null {
    if (!media || typeof media.id !== 'number' || !Number.isFinite(media.id)) return null;
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
    return now - entry.updatedAt >= BAKED_STALE_MS;
  }

  private bestFor(id: number): AniListMetadata | null {
    const local = this.localMap.get(id);
    if (local) return local;
    return this.bakedMap.get(id) ?? null;
  }

  private async refreshBatch(ids: number[]): Promise<AniListMetadata[]> {
    const unique = Array.from(new Set(ids.filter(id => Number.isFinite(id) && id > 0)));
    if (unique.length === 0) return [];

    const pending: number[] = [];
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
          void this.persistLocal();
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
    ids: number[],
    options?: { refreshStale?: boolean; maxBatch?: number; fetchMissing?: boolean },
  ): Promise<{ metadata: AniListMetadata[]; missingIds?: number[] }> {
    await this.ready;
    const refreshStale = options?.refreshStale ?? true;
    const maxBatch = options?.maxBatch;
    const fetchMissing = options?.fetchMissing ?? true;
    const now = Date.now();
    const metadata = new Map<number, AniListMetadata>();
    const refreshIds: number[] = [];

    for (const id of ids) {
      if (!Number.isFinite(id) || id <= 0) continue;
      const entry = this.bestFor(id);
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

    const missingIds = ids.filter(id => Number.isFinite(id) && id > 0 && !metadata.has(id));

    return {
      metadata: Array.from(metadata.values()),
      ...(missingIds.length > 0 ? { missingIds } : {}),
    };
  }

  public async clearLocalCache(): Promise<void> {
    await this.ready;
    this.localMap.clear();
    this.inflight.clear();

    try {
      await browser.storage.local.remove(STORAGE_KEY);
    } catch (error) {
      logError(normalizeError(error), 'AniListMetadataStore:clearLocalCache');
      throw error;
    }
  }
}
