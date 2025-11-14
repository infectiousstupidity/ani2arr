// src/services/mapping/static-mapping.provider.ts
import type { TtlCache } from '@/cache';
import { createError, ErrorCode, logError, normalizeError } from '@/shared/utils/error-handling';
import { logger } from '@/shared/utils/logger';
import type { ScopedLogger } from '@/shared/utils/logger';

const PRIMARY_URL = 'https://raw.githubusercontent.com/eliasbenb/PlexAniBridge-Mappings/v2/mappings.json';
const FALLBACK_URL = 'https://raw.githubusercontent.com/Kometa-Team/Anime-IDs/master/anime_ids.json';

const STATIC_SOFT_TTL = 24 * 60 * 60 * 1000; // 1 day
const STATIC_HARD_TTL = STATIC_SOFT_TTL * 7;
const CACHE_KEY = 'static';

export type StaticMappingSource = 'primary' | 'fallback';

export interface StaticMappingPayload {
  pairs: Record<number, number>;
}

export interface StaticMappingHit {
  tvdbId: number;
  source: StaticMappingSource;
}

export interface StaticMappingProviderOptions {
  fetch?: typeof fetch;
  scope?: string;
}

type StaticCaches = {
  primary: TtlCache<StaticMappingPayload>;
  fallback: TtlCache<StaticMappingPayload>;
};

export class StaticMappingProvider {
  private readonly log: ScopedLogger;
  private readonly fetchImpl: typeof fetch;
  private readonly primaryPairs = new Map<number, number>();
  private readonly fallbackPairs = new Map<number, number>();

  constructor(private readonly caches: StaticCaches, options: StaticMappingProviderOptions = {}) {
    this.log = logger.create(options.scope ?? 'StaticMappingProvider');
    const rawFetch: typeof fetch | undefined =
      options.fetch ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch : undefined);
    // Always bind to globalThis so calling via instance (this.fetchImpl) preserves the expected `this`.
    // This avoids: "'fetch' called on an object that does not implement interface Window."
    this.fetchImpl = rawFetch ? rawFetch.bind(globalThis) : ((...args: Parameters<typeof fetch>) => fetch(...args));
  }

  public async init(): Promise<void> {
    await Promise.all([this.ensureLoaded('primary'), this.ensureLoaded('fallback')]);

    // If nothing is in memory yet (first run, cold cache), perform a blocking
    // refresh so early lookups can benefit from static pairs and avoid
    // unnecessary upstream requests.
    if (this.primaryPairs.size === 0 && this.fallbackPairs.size === 0) {
      await this.refreshAll().catch(error => {
        logError(normalizeError(error), 'StaticMappingProvider:init:refreshAll');
      });
      return;
    }

    // Otherwise refresh in the background.
    void this.refresh('primary').catch(error => {
      logError(normalizeError(error), 'StaticMappingProvider:init:primary');
    });
    void this.refresh('fallback').catch(error => {
      logError(normalizeError(error), 'StaticMappingProvider:init:fallback');
    });
  }

  public get(anilistId: number): StaticMappingHit | null {
    const primary = this.primaryPairs.get(anilistId);
    if (typeof primary === 'number') {
      return { tvdbId: primary, source: 'primary' };
    }

    const fallback = this.fallbackPairs.get(anilistId);
    if (typeof fallback === 'number') {
      return { tvdbId: fallback, source: 'fallback' };
    }

    return null;
  }

  public async refreshAll(): Promise<void> {
    await Promise.all([this.refresh('primary'), this.refresh('fallback')]);
  }

  public async refresh(source: StaticMappingSource): Promise<void> {
    const cache = this.cacheFor(source);
    const map = this.mapFor(source);
    const url = this.urlFor(source);

    try {
      const cached = await cache.read(CACHE_KEY);
      const headers: Record<string, string> = {};
      const etag = cached?.meta?.etag as string | undefined;
      if (etag) {
        headers['If-None-Match'] = etag;
      }

      this.log.debug(`refresh(${source}): fetching ${url} (etag=${String(etag)})`);
      const response = await this.fetchImpl(url, { headers });

      if (response.status === 304 && cached) {
        this.log.debug(`refresh(${source}): not modified`);
        if (map.size === 0) {
          this.hydrateMap(map, cached.value.pairs);
        }
        return;
      }

      if (!response.ok) {
        const message = `Failed to fetch static mapping (${response.status})`;
        this.log.warn(`refresh(${source}): ${message}`);
        throw createError(ErrorCode.NETWORK_ERROR, message, 'Unable to refresh static mappings.');
      }

      const payload = (await response.json()) as unknown;
      const pairs = this.buildPairsFromSource(payload);
      this.hydrateMap(map, pairs);

      const nextEtag = response.headers.get('ETag');
      await cache.write(
        CACHE_KEY,
        { pairs },
        {
          staleMs: STATIC_SOFT_TTL,
          hardMs: STATIC_HARD_TTL,
          ...(nextEtag ? { meta: { etag: nextEtag } } : {}),
        },
      );
      this.log.info(`refresh(${source}): stored ${map.size} entries (etag=${String(nextEtag)})`);
    } catch (error) {
      const normalized = normalizeError(error);
      this.log.error(`refresh(${source}): error`, normalized);
      throw normalized;
    }
  }

  public async reset(): Promise<void> {
    this.primaryPairs.clear();
    this.fallbackPairs.clear();
    await Promise.all([
      this.caches.primary.remove(CACHE_KEY),
      this.caches.fallback.remove(CACHE_KEY),
    ]);
  }

  private async ensureLoaded(source: StaticMappingSource): Promise<void> {
    const map = this.mapFor(source);
    if (map.size > 0) return;

    const cached = await this.cacheFor(source).read(CACHE_KEY);
    if (cached) {
      this.hydrateMap(map, cached.value.pairs);
    }
  }

  private cacheFor(source: StaticMappingSource): TtlCache<StaticMappingPayload> {
    return source === 'primary' ? this.caches.primary : this.caches.fallback;
  }

  private mapFor(source: StaticMappingSource): Map<number, number> {
    return source === 'primary' ? this.primaryPairs : this.fallbackPairs;
  }

  private urlFor(source: StaticMappingSource): string {
    return source === 'primary' ? PRIMARY_URL : FALLBACK_URL;
  }

  private hydrateMap(map: Map<number, number>, pairs: Record<number, number>): void {
    map.clear();
    for (const [rawKey, rawValue] of Object.entries(pairs)) {
      const key = this.coerceId(rawKey);
      const value = this.coerceId(rawValue);
      if (key != null && value != null) {
        map.set(key, value);
      }
    }
    this.log.debug(`hydrateMap: populated map with ${map.size} entries`);
  }

  private buildPairsFromSource(source: unknown): Record<number, number> {
    const pairs: Record<number, number> = {};
    if (!source || typeof source !== 'object') {
      return pairs;
    }

    if (Array.isArray(source)) {
      for (const entry of source) {
        if (!entry || typeof entry !== 'object') continue;
        const record = entry as Record<string, unknown>;
        const anilistId = this.coerceId(record.anilist_id ?? record.anilist ?? record.aniId);
        const tvdbId = this.coerceId(record.tvdb_id ?? record.tvdb ?? record.tvdbid);
        if (anilistId != null && tvdbId != null) {
          pairs[anilistId] = tvdbId;
        }
      }
      return pairs;
    }

    const objectSource = source as Record<string, unknown>;
    for (const [rawKey, rawValue] of Object.entries(objectSource)) {
      const record = (typeof rawValue === 'object' && rawValue !== null
        ? (rawValue as Record<string, unknown>)
        : null);

      const explicitAni = record?.anilist_id ?? record?.anilist;
      const anilistId = this.coerceId(explicitAni ?? rawKey);

      const explicitTvdb = record?.tvdb_id ?? record?.tvdb ?? record?.tvdbid;
      const tvdbId =
        typeof rawValue === 'number' && Number.isFinite(rawValue)
          ? rawValue
          : this.coerceId(explicitTvdb);

      if (anilistId != null && tvdbId != null) {
        pairs[anilistId] = tvdbId;
      } else {
        // Commented out to reduce log noise while keeping the message available
        // for future debugging.
        // this.log.debug(
        //   `buildPairsFromSource: skipped entry ${rawKey} (anilist=${String(anilistId)}, tvdb=${String(tvdbId)})`,
        // );
      }
    }

    return pairs;
  }

  private coerceId(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value | 0;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return parsed | 0;
      }
    }

    return null;
  }
}
