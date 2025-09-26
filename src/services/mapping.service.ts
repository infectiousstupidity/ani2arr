// src/services/mapping.service.ts
import browser from 'webextension-polyfill';
import type { CacheService } from './cache.service';
import type { AnilistApiService, AniTitles, AniMedia } from '@/api/anilist.api';
import type { SonarrApiService } from '@/api/sonarr.api';
import type { ExtensionError } from '@/types';
import { createError, ErrorCode, logError, normalizeError } from '@/utils/error-handling';
import { retryWithBackoff } from '@/utils/retry';
import { normTitle, stripParenContent, computeTitleMatchScore } from '@/utils/matching';
import { extensionOptions } from '@/utils/storage';
import { incrementPhase0Counter } from '@/utils/metrics/phase0';

const PRIMARY_URL = 'https://raw.githubusercontent.com/eliasbenb/PlexAniBridge-Mappings/v2/mappings.json';
const FALLBACK_URL = 'https://raw.githubusercontent.com/Kometa-Team/Anime-IDs/master/anime_ids.json';
const RESOLVED_STALE = 30 * 24 * 60 * 60 * 1000;
const RESOLVED_HARD = 180 * 24 * 60 * 60 * 1000;
const FAILURE_CACHE_KEY_PREFIX = 'resolved_mapping_failure:';
const FAILURE_STALE = 30 * 60 * 1000;
const FAILURE_HARD = 2 * FAILURE_STALE;
const NETWORK_FAILURE_STALE = 5 * 60 * 1000;
const NETWORK_FAILURE_HARD = 3 * NETWORK_FAILURE_STALE;
const PRIMARY_JSON_KEY = 'static_primary_json_v3';
const PRIMARY_META_KEY = 'static_primary_meta_v3';
const FALLBACK_JSON_KEY = 'static_fallback_json_v3';
const FALLBACK_META_KEY = 'static_fallback_meta_v3';
const STATIC_SOFT_TTL = 24 * 60 * 60 * 1000;
const SCORE_THRESHOLD = 0.76;
const EARLY_STOP_THRESHOLD = 0.82;
const MAX_TERMS = 5;

type ResolveHints = {
  primaryTitle?: string;
};

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
const MAPPING_BATCH_SIZE = 3;
const MAPPING_BATCH_DELAY_MS = 1500;

export interface ResolvedMapping {
  tvdbId: number;
  successfulSynonym?: string;
}

export class MappingService {
  private inflight = new Map<number, InflightResolution>();
  private primaryPairsMap = new Map<number, number>();
  private fallbackPairsMap = new Map<number, number>();

  private mappingQueue: QueuedMappingRequest[] = [];
  private isProcessingMappingQueue = false;

  constructor(
    private readonly sonarrApi: SonarrApiService,
    private readonly anilistApi: AnilistApiService,
    private readonly cache: CacheService,
  ) {}

  private successCacheKey(anilistId: number): string {
    return `resolved_mapping:${anilistId}`;
  }

  private failureCacheKey(anilistId: number): string {
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

  public async initStaticPairs(): Promise<void> {
    try {
      await Promise.all([this.ensureMapLoaded('primary'), this.ensureMapLoaded('fallback')]);
    } catch (e) {
      logError(normalizeError(e), `MappingService:initStaticPairs`);
    } finally {
      await Promise.all([this.refreshStaticMapping('primary'), this.refreshStaticMapping('fallback')]);
    }
  }

  public resolveTvdbId(anilistId: number, options: ResolveTvdbIdOptions = {}): Promise<ResolvedMapping> {
    const bypassFailureCache = options.ignoreFailureCache === true;
    const existing = this.inflight.get(anilistId);

    if (existing) {
      if (bypassFailureCache && !existing.bypassFailureCache) {
        // Need a fresh attempt that bypasses the failure cache.
      } else {
        return existing.promise;
      }
    }

    const promise = this.resolveTvdbIdInternal(anilistId, options);
    this.inflight.set(anilistId, { promise, bypassFailureCache });

    promise.finally(() => {
      const current = this.inflight.get(anilistId);
      if (current?.promise === promise) {
        this.inflight.delete(anilistId);
      }
    });

    return promise;
  }

  private async hasSonarrConfig(): Promise<boolean> {
    const opts = await extensionOptions.getValue();
    return !!opts?.sonarrUrl && !!opts?.sonarrApiKey;
  }

  private async resolveTvdbIdInternal(anilistId: number, options: ResolveTvdbIdOptions): Promise<ResolvedMapping> {
    const successKey = this.successCacheKey(anilistId);
    const failureKey = this.failureCacheKey(anilistId);

    const cachedSuccess = await this.cache.get<ResolvedMapping>(successKey);
    if (cachedSuccess) {
      incrementPhase0Counter('cache-hit');
      try {
        await this.cache.delete(failureKey);
      } catch {
        /* noop */
      }
      return cachedSuccess;
    }

    if (!options.ignoreFailureCache) {
      const cachedFailure = await this.cache.get<ExtensionError>(failureKey);
      if (cachedFailure) {
        throw cachedFailure;
      }
    }

    try {
      const result = await this.getOrQueueResolution(anilistId, options);
      try {
        await this.cache.set(successKey, result, RESOLVED_STALE, RESOLVED_HARD);
      } catch {
        /* noop */
      }
      try {
        await this.cache.delete(failureKey);
      } catch {
        /* noop */
      }
      return result;
    } catch (error) {
      const normalized = normalizeError(error);
      if (this.shouldCacheFailure(normalized)) {
        const { stale, hard } = this.failureTtlsFor(normalized);
        try {
          await this.cache.set(failureKey, normalized, stale, hard);
        } catch {
          /* noop */
        }
      }
      throw normalized;
    }
  }

  private async getOrQueueResolution(anilistId: number, options: ResolveTvdbIdOptions = {}): Promise<ResolvedMapping> {
    await Promise.all([this.ensureMapLoaded('primary'), this.ensureMapLoaded('fallback')]);

    const staticHit = this.checkStaticMaps(anilistId);
    if (staticHit) {
      if (staticHit.source === 'primary') incrementPhase0Counter('static-primary');
      else if (staticHit.source === 'fallback') incrementPhase0Counter('static-fallback');
      return { tvdbId: staticHit.tvdbId };
    }

    const sonarrConfigured = await this.hasSonarrConfig();

    if (options.network === 'never' || !sonarrConfigured) {
      // Skip hinted lookups and network queue entirely
      const reason = options.network === 'never'
        ? 'Local-only check failed, network access is disabled for this request.'
        : 'Local-only check failed, Sonarr is not configured.';
      throw this.notFound(anilistId, reason);
    }

    const hintTitle = options.hints?.primaryTitle?.trim();
    let normalizedHints: ResolveHints | undefined;
    if (hintTitle && sonarrConfigured) {
      const hinted = await this.attemptHintedSonarrLookup(anilistId, hintTitle);
      if (hinted) {
        return hinted;
      }
      normalizedHints = { primaryTitle: hintTitle };
    }

    return new Promise((resolve, reject) => {
      const request: QueuedMappingRequest = { anilistId, resolve, reject };
      if (normalizedHints) {
        request.hints = normalizedHints;
      }
      this.mappingQueue.push(request);
      if (!this.isProcessingMappingQueue) {
        this.processMappingQueue();
      }
    });
  }

  private async processMappingQueue(): Promise<void> {
    if (this.isProcessingMappingQueue) return;
    this.isProcessingMappingQueue = true;

    while (this.mappingQueue.length > 0) {
      const batch = this.mappingQueue.splice(0, MAPPING_BATCH_SIZE);

      await Promise.allSettled(batch.map(async (req) => {
        try {
          const result = await this.performNetworkResolution(req.anilistId, req.hints);
          req.resolve(result);
        } catch (e) {
          req.reject(normalizeError(e));
        }
      }));

      if (this.mappingQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, MAPPING_BATCH_DELAY_MS));
      }
    }

    this.isProcessingMappingQueue = false;
  }

  private async attemptHintedSonarrLookup(anilistId: number, primaryTitle: string): Promise<ResolvedMapping | null> {
    const normalizedTitle = primaryTitle.trim();
    if (!normalizedTitle) return null;

    // Guard: do nothing if Sonarr is not configured
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
      const normalized = normalizeError(e);
      if (normalized.code !== ErrorCode.VALIDATION_ERROR && normalized.code !== ErrorCode.CONFIGURATION_ERROR) {
        logError(normalizeError(e), `MappingService:hintLookup:${anilistId}`);
      }
      return null;
    }
  }

  private async performNetworkResolution(anilistId: number, hints?: ResolveHints): Promise<ResolvedMapping> {
    // Guard: no network resolution if Sonarr is not configured
    if (!(await this.hasSonarrConfig())) {
      throw this.notFound(anilistId, 'Sonarr is not configured for network resolution.');
    }

    const media = await this.anilistApi.fetchMediaWithRelations(anilistId);

    if (media.format === 'MOVIE') {
      throw this.notFound(anilistId, `Unsupported format: ${media.format}. Only TV series can be added to Sonarr.`);
    }

    const prequelRootId = this.findPrequelRoot(media);
    if (prequelRootId !== anilistId) {
      const staticHit = this.checkStaticMaps(prequelRootId);
      if (staticHit) {
        if (staticHit.source === 'primary') incrementPhase0Counter('static-primary');
        else if (staticHit.source === 'fallback') incrementPhase0Counter('static-fallback');
        return { tvdbId: staticHit.tvdbId };
      }
    }

    const enrichedTitle: AniTitles = { ...media.title };
    const synonyms = Array.isArray(media.synonyms) ? [...media.synonyms] : [];

    const hintTitle = hints?.primaryTitle?.trim();
    if (hintTitle) {
      synonyms.unshift(hintTitle);
      if (!enrichedTitle.english) {
        enrichedTitle.english = hintTitle;
      }
    }

    const startYear = media.startDate?.year ?? undefined;
    const sonarrResult = await this.lookupViaSonarr(anilistId, enrichedTitle, synonyms, startYear);
    incrementPhase0Counter('sonarr-lookup');
    return sonarrResult;
  }

  private findPrequelRoot(media: AniMedia): number {
    let currentNode = media;
    let rootId = media.id;

    while (currentNode?.relations) {
      const prequelEdge = currentNode.relations.edges.find(e => e.relationType === 'PREQUEL');
      if (prequelEdge) {
        rootId = prequelEdge.node.id;
        currentNode = prequelEdge.node;
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

  private async refreshStaticMapping(type: 'primary' | 'fallback'): Promise<void> {
    const config = type === 'primary'
      ? { url: PRIMARY_URL, jsonKey: PRIMARY_JSON_KEY, metaKey: PRIMARY_META_KEY, map: this.primaryPairsMap, name: 'Primary' }
      : { url: FALLBACK_URL, jsonKey: FALLBACK_JSON_KEY, metaKey: FALLBACK_META_KEY, map: this.fallbackPairsMap, name: 'Fallback' };

    try {
      await retryWithBackoff(async () => {
        const meta = (await browser.storage.local.get(config.metaKey))[config.metaKey] as { etag?: string; updatedAt?: number } | undefined;
        const now = Date.now();
        if (meta?.updatedAt && now - meta.updatedAt < STATIC_SOFT_TTL) return;

        const headers: HeadersInit = { 'If-None-Match': meta?.etag ?? '' };
        const resp = await fetch(config.url, { headers, cache: 'no-store' });

        if (resp.status === 304) {
          await browser.storage.local.set({ [config.metaKey]: { ...meta, updatedAt: now } });
          return;
        }
        if (!resp.ok) throw new Error(`${config.name} mapping fetch failed: ${resp.status}`);

        const json = await resp.json();
        const etag = resp.headers.get('ETag') ?? undefined;
        await browser.storage.local.set({ [config.jsonKey]: json });
        await browser.storage.local.set({ [config.metaKey]: { etag, updatedAt: now } });

        this.buildMapFromJSON(json, config.map, type);
      });
    } catch (e) {
      logError(normalizeError(e), `MappingService:refreshStaticMapping:${type}`);
    }
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
      const mappingEntry = entry as MappingEntry;
      const anilistId = this.coerceId(mappingEntry.anilist_id ?? mappingEntry.anilist);
      const tvdbId = this.coerceId(mappingEntry.tvdb_id ?? mappingEntry.tvdb);
      if (anilistId != null && tvdbId != null) {
        map.set(anilistId, tvdbId);
      }
    }
  }

  private async ensureMapLoaded(type: 'primary' | 'fallback'): Promise<void> {
    const config = type === 'primary'
      ? { jsonKey: PRIMARY_JSON_KEY, map: this.primaryPairsMap }
      : { jsonKey: FALLBACK_JSON_KEY, map: this.fallbackPairsMap };

    if (config.map.size > 0) return;
    const raw = await browser.storage.local.get(config.jsonKey);
    const json = raw[config.jsonKey];
    if (json) {
      this.buildMapFromJSON(json, config.map, type);
    }
  }

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
    let bestMatch: { tvdbId: number; score: number; term: string } | undefined;

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
            bestMatch = { tvdbId: r.tvdbId, score, term };
            break;
          }

          if (score >= SCORE_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
            bestMatch = { tvdbId: r.tvdbId, score, term };
          }
        }
      } catch (e) {
        logError(normalizeError(e), `MappingService:lookupViaSonarr:term:'${term}'`);
      }

      if (bestMatch && bestMatch.score >= EARLY_STOP_THRESHOLD) {
        break;
      }
    }

    if (bestMatch) {
      return { tvdbId: bestMatch.tvdbId, successfulSynonym: bestMatch.term };
    }

    throw this.notFound(anilistId, 'Sonarr lookup yielded no matching results.');
  }

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

    const addTerm = (term: string) => {
      const key = normTitle(term);
      if (key.length > 2 && !seen.has(key)) {
        seen.add(key);
        out.push(term);
      }
    };

    const baseTitles: string[] = [];
    if (titles.english) baseTitles.push(titles.english);
    if (titles.romaji) baseTitles.push(titles.romaji);
    if (synonyms) baseTitles.push(...synonyms);

    for (const title of baseTitles) {
      const original = stripParenContent(title).trim();
      if (!original) continue;

      addTerm(original);
      if (year) {
        addTerm(`${original} ${year}`);
      }
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
