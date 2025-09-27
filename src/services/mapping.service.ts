// src/services/mapping.service.ts
import browser from 'webextension-polyfill';
import type { AnilistApiService, AniTitles, AniMedia } from '@/api/anilist.api';
import type { SonarrApiService } from '@/api/sonarr.api';
import type { ExtensionError } from '@/types';
import { createError, ErrorCode, logError, normalizeError } from '@/utils/error-handling';
import { retryWithBackoff } from '@/utils/retry';
import { normTitle, stripParenContent, computeTitleMatchScore } from '@/utils/matching';
import { extensionOptions } from '@/utils/storage';
import { incrementPhase0Counter } from '@/utils/metrics/phase0';
import { logger } from '@/utils/logger';
import { createCache } from '@/cache';
import { idbAdapter } from '@/cache/adapters/idb';
import { memoryAdapter } from '@/cache/adapters/memory';

const log = logger.create('MappingService');

// Static mappings
const PRIMARY_URL = 'https://raw.githubusercontent.com/eliasbenb/PlexAniBridge-Mappings/v2/mappings.json';
const FALLBACK_URL = 'https://raw.githubusercontent.com/Kometa-Team/Anime-IDs/master/anime_ids.json';
const PRIMARY_JSON_KEY = 'static_primary_json_v3';
const PRIMARY_META_KEY = 'static_primary_meta_v3';
const FALLBACK_JSON_KEY = 'static_fallback_json_v3';
const FALLBACK_META_KEY = 'static_fallback_meta_v3';
const STATIC_SOFT_TTL = 24 * 60 * 60 * 1000;

// Result cache TTLs
const RESOLVED_SOFT_TTL = 30 * 24 * 60 * 60 * 1000;  // 30d
const RESOLVED_HARD_TTL = 180 * 24 * 60 * 60 * 1000; // 180d

// Failure cache TTLs
const FAILURE_CACHE_KEY_PREFIX = 'resolved_mapping_failure:';
const FAILURE_STALE = 30 * 60 * 1000;
const FAILURE_HARD = 2 * FAILURE_STALE;
const NETWORK_FAILURE_STALE = 5 * 60 * 1000;
const NETWORK_FAILURE_HARD = 3 * NETWORK_FAILURE_STALE;

// Matching
const SCORE_THRESHOLD = 0.76;
const EARLY_STOP_THRESHOLD = 0.82;
const MAX_TERMS = 5;

// Rate limiting queue
const MAPPING_BATCH_SIZE = 3;
const MAPPING_BATCH_DELAY_MS = 1500;

type ResolveHints = { primaryTitle?: string };

type ResolveTvdbIdOptions = {
  network?: 'never';
  hints?: ResolveHints;
  ignoreFailureCache?: boolean;
};

type QueuedMappingRequest = {
  anilistId: number;
  resolve: (value: ResolvedMapping) => void;
  reject: (reason: Error | ExtensionError) => void;
  hints?: ResolveHints;
};

type InflightResolution = {
  promise: Promise<ResolvedMapping>;
  bypassFailureCache: boolean;
};

export interface ResolvedMapping {
  tvdbId: number;
  successfulSynonym?: string;
}

export class MappingService {
  // Inflight dedupe
  private inflight = new Map<number, InflightResolution>();

  // Static maps
  private primaryPairsMap = new Map<number, number>();
  private fallbackPairsMap = new Map<number, number>();

  // Queue
  private mappingQueue: QueuedMappingRequest[] = [];
  private isProcessingMappingQueue = false;

  // Unified caches
  private hot = createCache(memoryAdapter(300), {
    namespace: 'map:mem',
    softTtlMs: RESOLVED_SOFT_TTL,
    hardTtlMs: RESOLVED_HARD_TTL,
    errorTtlMs: NETWORK_FAILURE_STALE,
  });

  private cold = createCache(idbAdapter('mapping'), {
    namespace: 'map:idb',
    softTtlMs: RESOLVED_SOFT_TTL,
    hardTtlMs: RESOLVED_HARD_TTL,
    errorTtlMs: NETWORK_FAILURE_STALE,
  });

  constructor(
    private readonly sonarrApi: SonarrApiService,
    private readonly anilistApi: AnilistApiService,
  ) {}

  // Public API

  public async initStaticPairs(): Promise<void> {
    try {
      await Promise.all([this.ensureMapLoaded('primary'), this.ensureMapLoaded('fallback')]);
    } catch (e) {
      logError(normalizeError(e), 'MappingService:initStaticPairs');
    } finally {
      await Promise.all([this.refreshStaticMapping('primary'), this.refreshStaticMapping('fallback')]);
    }
  }

  public resolveTvdbId(anilistId: number, options: ResolveTvdbIdOptions = {}): Promise<ResolvedMapping> {
    const bypassFailureCache = options.ignoreFailureCache === true;
    const existing = this.inflight.get(anilistId);
    if (existing) {
      if (bypassFailureCache && !existing.bypassFailureCache) {
        // fall through to create a new inflight that bypasses failure cache
      } else {
        return existing.promise;
      }
    }
    const promise = this.resolveTvdbIdInternal(anilistId, options);
    this.inflight.set(anilistId, { promise, bypassFailureCache });
    promise.finally(() => {
      const cur = this.inflight.get(anilistId);
      if (cur?.promise === promise) this.inflight.delete(anilistId);
    });
    return promise;
  }

  // Internals

  private async hasSonarrConfig(): Promise<boolean> {
    const opts = await extensionOptions.getValue();
    return !!opts?.sonarrUrl && !!opts?.sonarrApiKey;
    // Note: respect your rule - if not configured, do not hit network
  }

  private successKey(anilistId: number): string {
    return `resolved_mapping:${anilistId}`;
  }

  private failureKey(anilistId: number): string {
    return `${FAILURE_CACHE_KEY_PREFIX}${anilistId}`;
  }

  private shouldCacheFailure(error: ExtensionError): boolean {
    return (
      error.code === ErrorCode.VALIDATION_ERROR ||
      error.code === ErrorCode.CONFIGURATION_ERROR ||
      error.code === ErrorCode.NETWORK_ERROR ||
      error.code === ErrorCode.API_ERROR ||
      error.code === ErrorCode.PERMISSION_ERROR
    );
  }

  private failureTtlsFor(error: ExtensionError): { stale: number; hard: number } {
    if (error.code === ErrorCode.NETWORK_ERROR || error.code === ErrorCode.API_ERROR) {
      return { stale: NETWORK_FAILURE_STALE, hard: NETWORK_FAILURE_HARD };
    }
    return { stale: FAILURE_STALE, hard: FAILURE_HARD };
  }

  private async resolveTvdbIdInternal(anilistId: number, options: ResolveTvdbIdOptions): Promise<ResolvedMapping> {
    const now = Date.now();
    const sKey = this.successKey(anilistId);
    const fKey = this.failureKey(anilistId);

    // hot
    const hot = await this.hot.get<ResolvedMapping>(sKey);
    if (hot && !this.hot.isExpired(hot, now)) {
      incrementPhase0Counter('cache-hit');
      try { await this.cold.del(fKey); } catch {
        // Ignore errors when deleting failure cache
      }
      return hot.value;
    }

    // cold
    const cold = await this.cold.get<ResolvedMapping>(sKey);
    if (cold && !this.cold.isExpired(cold, now)) {
      incrementPhase0Counter('cache-hit');
      // refresh hot
      await this.hot.set(sKey, cold.value, now);
      try { await this.cold.del(fKey); } catch {
        // Intentionally ignore errors when deleting failure cache
      }
      if (this.cold.isStale(cold, now)) void this.revalidate(anilistId);
      return cold.value;
    }

    // failure cache
    if (!options.ignoreFailureCache) {
      const f = await this.cold.get<ExtensionError>(fKey);
      if (f && !this.cold.isExpired(f, now)) {
        throw f.value;
      }
    }

    // local only path
    const local = await this.tryLocal(anilistId, options);
    if (local) {
      await this.hot.set(sKey, local, now);
      await this.cold.set(sKey, local, now);
      try { await this.cold.del(fKey); } catch {
        // Intentionally ignore errors when deleting failure cache
      }
      return local;
    }

    // maybe block network
    if (options.network === 'never' || !(await this.hasSonarrConfig())) {
      const reason = options.network === 'never'
        ? 'Local-only check failed, network disabled.'
        : 'Local-only check failed, Sonarr not configured.';
      const err = this.notFound(anilistId, reason);
      if (this.shouldCacheFailure(err)) {
        const ttl = this.failureTtlsFor(err);
        await this.cold.set(fKey, err as unknown as ExtensionError, now + ttl.stale - now);
        // above uses cache API expecting value plus TTLs via set; better to use setError like below:
        await this.cold.setError(fKey, now);
      }
      throw err;
    }

    // queue network resolve
    return new Promise((resolve, reject) => {
      const req: QueuedMappingRequest = { anilistId, resolve, reject, hints: options.hints };
      this.mappingQueue.push(req);
      if (!this.isProcessingMappingQueue) this.processMappingQueue();
    });
  }

  private async tryLocal(anilistId: number, options: ResolveTvdbIdOptions): Promise<ResolvedMapping | null> {
    await Promise.all([this.ensureMapLoaded('primary'), this.ensureMapLoaded('fallback')]);

    const staticHit = this.checkStaticMaps(anilistId);
    if (staticHit) {
      log.debug(`[Static HIT] anilistId:${anilistId} source:${staticHit.source}`);
      if (staticHit.source === 'primary') incrementPhase0Counter('static-primary');
      else incrementPhase0Counter('static-fallback');
      return { tvdbId: staticHit.tvdbId };
    }

    // Optional hinted single lookup but only if configured
    const hintTitle = options.hints?.primaryTitle?.trim();
    if (hintTitle && (await this.hasSonarrConfig())) {
      const hinted = await this.attemptHintedSonarrLookup(anilistId, hintTitle);
      if (hinted) return hinted;
    }

    return null;
  }

  private async revalidate(anilistId: number): Promise<void> {
    try {
      const res = await this.performNetworkResolution(anilistId, undefined);
      const key = this.successKey(anilistId);
      await this.hot.set(key, res, Date.now());
      await this.cold.set(key, res, Date.now());
    } catch (e) {
      const err = normalizeError(e);
      if (this.shouldCacheFailure(err)) {
        const { stale } = this.failureTtlsFor(err);
        await this.cold.setError(this.failureKey(anilistId), Date.now());
      }
    }
  }

  private async processMappingQueue(): Promise<void> {
    if (this.isProcessingMappingQueue) return;
    this.isProcessingMappingQueue = true;

    while (this.mappingQueue.length > 0) {
      const batch = this.mappingQueue.splice(0, MAPPING_BATCH_SIZE);
      await Promise.allSettled(batch.map(async (req) => {
        try {
          const result = await this.performNetworkResolution(req.anilistId, req.hints);
          const key = this.successKey(req.anilistId);
          await this.hot.set(key, result, Date.now());
          await this.cold.set(key, result, Date.now());
          req.resolve(result);
        } catch (e) {
          req.reject(normalizeError(e));
        }
      }));
      if (this.mappingQueue.length > 0) {
        await new Promise(r => setTimeout(r, MAPPING_BATCH_DELAY_MS));
      }
    }

    this.isProcessingMappingQueue = false;
  }

  private async attemptHintedSonarrLookup(anilistId: number, primaryTitle: string): Promise<ResolvedMapping | null> {
    const normalizedTitle = primaryTitle.trim();
    if (!normalizedTitle) return null;
    if (!(await this.hasSonarrConfig())) return null;

    try {
      const result = await this.lookupViaSonarr(
        anilistId,
        { english: normalizedTitle, romaji: normalizedTitle },
        [normalizedTitle],
        undefined,
      );
      incrementPhase0Counter('sonarr-lookup');
      return result;
    } catch (e) {
      const n = normalizeError(e);
      if (n.code !== ErrorCode.VALIDATION_ERROR && n.code !== ErrorCode.CONFIGURATION_ERROR) {
        logError(n, `MappingService:hintLookup:${anilistId}`);
      }
      return null;
    }
  }

  private async performNetworkResolution(anilistId: number, hints?: ResolveHints): Promise<ResolvedMapping> {
    if (!(await this.hasSonarrConfig())) {
      throw this.notFound(anilistId, 'Sonarr is not configured for network resolution.');
    }

    const media = await this.anilistApi.fetchMediaWithRelations(anilistId);

    if (media.format === 'MOVIE') {
      throw this.notFound(anilistId, `Unsupported format: ${media.format}. Only TV series are supported.`);
    }

    const prequelRootId = this.findPrequelRoot(media);
    if (prequelRootId !== anilistId) {
      const staticHit = this.checkStaticMaps(prequelRootId);
      if (staticHit) {
        if (staticHit.source === 'primary') incrementPhase0Counter('static-primary');
        else incrementPhase0Counter('static-fallback');
        return { tvdbId: staticHit.tvdbId };
      }
    }

    const enrichedTitle: AniTitles = { ...media.title };
    const synonyms = Array.isArray(media.synonyms) ? [...media.synonyms] : [];
    const hintTitle = hints?.primaryTitle?.trim();
    if (hintTitle) {
      synonyms.unshift(hintTitle);
      if (!enrichedTitle.english) enrichedTitle.english = hintTitle;
    }

    const startYear = media.startDate?.year ?? undefined;
    const sonarrResult = await this.lookupViaSonarr(anilistId, enrichedTitle, synonyms, startYear);
    incrementPhase0Counter('sonarr-lookup');
    return sonarrResult;
  }

  private findPrequelRoot(media: AniMedia): number {
    let cur = media;
    let rootId = media.id;
    while (cur?.relations) {
      const prequel = cur.relations.edges.find(e => e.relationType === 'PREQUEL');
      if (prequel) {
        rootId = prequel.node.id;
        cur = prequel.node;
      } else {
        break;
      }
    }
    return rootId;
  }

  private checkStaticMaps(anilistId: number): { tvdbId: number; source: 'primary' | 'fallback' } | null {
    if (this.primaryPairsMap.has(anilistId)) {
      return { tvdbId: this.primaryPairsMap.get(anilistId)!, source: 'primary' };
    }
    if (this.fallbackPairsMap.has(anilistId)) {
      return { tvdbId: this.fallbackPairsMap.get(anilistId)!, source: 'fallback' };
    }
    return null;
  }

  // Static mappings refresh and load

  private async refreshStaticMapping(type: 'primary' | 'fallback'): Promise<void> {
    const cfg = type === 'primary'
      ? { url: PRIMARY_URL, jsonKey: PRIMARY_JSON_KEY, metaKey: PRIMARY_META_KEY, map: this.primaryPairsMap, name: 'Primary' }
      : { url: FALLBACK_URL, jsonKey: FALLBACK_JSON_KEY, metaKey: FALLBACK_META_KEY, map: this.fallbackPairsMap, name: 'Fallback' };

    try {
      await retryWithBackoff(async () => {
        const meta = (await browser.storage.local.get(cfg.metaKey))[cfg.metaKey] as { etag?: string; updatedAt?: number } | undefined;
        const now = Date.now();
        if (meta?.updatedAt && now - meta.updatedAt < STATIC_SOFT_TTL) return;

        const headers: HeadersInit = meta?.etag ? { 'If-None-Match': meta.etag } : {};
        const resp = await fetch(cfg.url, { headers, cache: 'no-store' });

        if (resp.status === 304) {
          await browser.storage.local.set({ [cfg.metaKey]: { ...meta, updatedAt: now } });
          return;
        }
        if (!resp.ok) throw new Error(`${cfg.name} mapping fetch failed: ${resp.status}`);

        const json = await resp.json();
        const etag = resp.headers.get('ETag') ?? undefined;
        await browser.storage.local.set({ [cfg.jsonKey]: json });
        await browser.storage.local.set({ [cfg.metaKey]: { etag, updatedAt: now } });

        this.buildMapFromJSON(json, cfg.map, type);
      });
    } catch (e) {
      logError(normalizeError(e), `MappingService:refreshStaticMapping:${type}`);
    }
  }

  private async ensureMapLoaded(type: 'primary' | 'fallback'): Promise<void> {
    const cfg = type === 'primary'
      ? { jsonKey: PRIMARY_JSON_KEY, map: this.primaryPairsMap }
      : { jsonKey: FALLBACK_JSON_KEY, map: this.fallbackPairsMap };

    if (cfg.map.size > 0) return;
    const raw = await browser.storage.local.get(cfg.jsonKey);
    const json = raw[cfg.jsonKey];
    if (json) this.buildMapFromJSON(json, cfg.map, type);
  }

  private buildMapFromJSON(json: unknown, map: Map<number, number>, type: 'primary' | 'fallback'): void {
    map.clear();
    const source = type === 'primary' ? (json as { anilist?: unknown }).anilist : json;
    if (!source || typeof source !== 'object') return;

    interface MappingEntry {
      anilist_id?: unknown;
      anilist?: unknown;
      tvdb_id?: unknown;
      tvdb?: unknown;
    }

    for (const entry of Object.values(source as Record<string, unknown>[])) {
      const me = entry as MappingEntry;
      const anilistId = this.coerceId(me.anilist_id ?? me.anilist);
      const tvdbId = this.coerceId(me.tvdb_id ?? me.tvdb);
      if (anilistId != null && tvdbId != null) {
        map.set(anilistId, tvdbId);
      }
    }
  }

  // Sonarr lookup

  private async lookupViaSonarr(
    anilistId: number,
    titles: AniTitles,
    synonyms: string[] | undefined,
    startYear: number | undefined,
  ): Promise<ResolvedMapping> {
    const options = await extensionOptions.getValue();
    if (!options?.sonarrUrl || !options?.sonarrApiKey) {
      throw createError(ErrorCode.CONFIGURATION_ERROR, 'Sonarr not configured for lookup', 'Sonarr is not configured.');
    }
    const credentials = { url: options.sonarrUrl, apiKey: options.sonarrApiKey };

    const terms = this.buildSearchTerms(titles, synonyms, startYear);
    let best: { tvdbId: number; score: number; term: string } | undefined;

    for (const term of terms) {
      try {
        const results = await this.sonarrApi.lookupSeriesByTerm(term, credentials);
        for (const r of results) {
          const params = {
            queryRaw: term,
            candidateRaw: r.title,
            ...(r.year !== undefined && { candidateYear: r.year }),
            ...(startYear !== undefined && { targetYear: startYear }),
            ...(r.genres !== undefined && { candidateGenres: r.genres }),
          };
          const score = computeTitleMatchScore(params);
          if (score >= EARLY_STOP_THRESHOLD) {
            best = { tvdbId: r.tvdbId, score, term };
            break;
          }
          if (score >= SCORE_THRESHOLD && (!best || score > best.score)) {
            best = { tvdbId: r.tvdbId, score, term };
          }
        }
      } catch (e) {
        logError(normalizeError(e), `MappingService:lookupViaSonarr:term:'${term}'`);
      }
      if (best && best.score >= EARLY_STOP_THRESHOLD) break;
    }

    if (best) return { tvdbId: best.tvdbId, successfulSynonym: best.term };
    throw this.notFound(anilistId, 'Sonarr lookup yielded no matching results.');
  }

  // Helpers

  private coerceId(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value | 0;
    if (typeof value === 'string') {
      const n = Number.parseInt(value.trim(), 10);
      return Number.isFinite(n) ? (n | 0) : null;
    }
    return null;
  }

  private buildSearchTerms(titles: AniTitles, synonyms: string[] | undefined, year?: number): string[] {
    const seen = new Set<string>();
    const out: string[] = [];

    const add = (term: string) => {
      const key = normTitle(term);
      if (key.length > 2 && !seen.has(key)) {
        seen.add(key);
        out.push(term);
      }
    };

    const base: string[] = [];
    if (titles.english) base.push(titles.english);
    if (titles.romaji) base.push(titles.romaji);
    if (synonyms) base.push(...synonyms);

    for (const t of base) {
      const original = stripParenContent(t).trim();
      if (!original) continue;
      add(original);
      if (year) add(`${original} ${year}`);
    }

    return out.slice(0, MAX_TERMS);
  }

  private notFound(anilistId: number, details?: string): ExtensionError {
    return createError(
      ErrorCode.VALIDATION_ERROR,
      `Failed to resolve TVDB ID for AniList ID: ${anilistId}. ${details || ''}`.trim(),
      'Could not find a matching series on TheTVDB.',
    );
  }
}
