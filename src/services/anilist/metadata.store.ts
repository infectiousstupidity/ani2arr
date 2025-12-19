import { browser } from 'wxt/browser';
import type { AnilistApiService } from '@/clients/anilist.api';
import type { AniListMetadata, AniListMetadataBundle, AniMedia, AniTitles } from '@/shared/types';
import { logError, normalizeError } from '@/shared/errors/error-utils';
import { logger } from '@/shared/utils/logger';


// Helper to convert days to milliseconds
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

const normalizeTitles = (titles?: AniTitles | null): AniTitles => {
  if (!titles) return {};
  const normalized: AniTitles = {};
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

  constructor(private readonly anilistApi: AnilistApiService) {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    try {
      const url = browser.runtime.getURL('/anilist-static-metadata.json');
      const response = await fetch(url);
      if (response.ok) {
        const bundle = (await response.json()) as AniListMetadataBundle;
        this.loadBakedBundle(bundle);
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

  private loadBakedBundle(bundle: AniListMetadataBundle | null | undefined): void {
    if (!bundle || !Array.isArray(bundle.entries)) {
      this.log.warn('loadBakedBundle: missing or invalid bundle');
      return;
    }
    const generatedAt = typeof bundle.generatedAt === 'number' && Number.isFinite(bundle.generatedAt) ? bundle.generatedAt : Date.now();
    for (const entry of bundle.entries) {
      const normalized = this.normalizeEntry({ ...entry, updatedAt: entry.updatedAt ?? generatedAt });
      if (normalized) {
        this.bakedMap.set(normalized.id, normalized);
      }
    }
    this.log.debug(`loadBakedBundle: loaded ${this.bakedMap.size} entries`);
  }

  private normalizeEntry(raw: Partial<AniListMetadata>): AniListMetadata | null {
    if (!raw || typeof raw.id !== 'number' || !Number.isFinite(raw.id)) return null;
    const updatedAt =
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now();
    const seasonYear =
      raw.seasonYear === null || raw.seasonYear === undefined
        ? null
        : Number.isFinite(raw.seasonYear)
          ? Number(raw.seasonYear)
          : null;
    const coverImage = raw.coverImage
      ? {
          medium: raw.coverImage.medium ?? null,
          large: raw.coverImage.large ?? null,
        }
      : null;
    return {
      id: raw.id,
      titles: normalizeTitles(raw.titles ?? {}),
      seasonYear,
      format: raw.format ?? null,
      coverImage,
      updatedAt,
    };
  }

  private async hydrateLocal(): Promise<void> {
    try {
      const stored = await browser.storage.local.get(STORAGE_KEY);
      const record = stored?.[STORAGE_KEY] as PersistedRecord | undefined;
      if (!record || typeof record !== 'object') return;

      const now = Date.now();
      for (const [key, value] of Object.entries(record)) {
        const id = Number(key);
        if (!Number.isFinite(id)) continue;
        const normalized = this.normalizeEntry({ ...value, id });
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

  private fromMedia(media: AniMedia): AniListMetadata | null {
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
      .fetchMediaBatch(limited)
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
    options?: { refreshStale?: boolean; maxBatch?: number },
  ): Promise<{ metadata: AniListMetadata[]; missingIds?: number[] }> {
    await this.ready;
    const refreshStale = options?.refreshStale ?? true;
    const maxBatch = options?.maxBatch;
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
      } else {
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
}
