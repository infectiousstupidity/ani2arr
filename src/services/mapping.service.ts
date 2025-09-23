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
const PRIMARY_JSON_KEY = 'static_primary_json_v3';
const PRIMARY_META_KEY = 'static_primary_meta_v3';
const FALLBACK_JSON_KEY = 'static_fallback_json_v3';
const FALLBACK_META_KEY = 'static_fallback_meta_v3';
const STATIC_SOFT_TTL = 24 * 60 * 60 * 1000;
const SCORE_THRESHOLD = 0.76;
const EARLY_STOP_THRESHOLD = 0.82;
const MAX_TERMS = 5;

type QueuedMappingRequest = {
  anilistId: number;
  resolve: (value: ResolvedMapping) => void;
  reject: (reason: Error | ExtensionError) => void;
};
const MAPPING_BATCH_SIZE = 3;
const MAPPING_BATCH_DELAY_MS = 1500;

export interface ResolvedMapping {
  tvdbId: number;
  successfulSynonym?: string;
}

export class MappingService {
  private inflight = new Map<number, Promise<ResolvedMapping>>();
  private primaryPairsMap = new Map<number, number>();
  private fallbackPairsMap = new Map<number, number>();

  private mappingQueue: QueuedMappingRequest[] = [];
  private isProcessingMappingQueue = false;

  constructor(
    private readonly sonarrApi: SonarrApiService,
    private readonly anilistApi: AnilistApiService,
    private readonly cache: CacheService,
  ) {}

  public async initStaticPairs(): Promise<void> {
    try {
      await Promise.all([this.ensureMapLoaded('primary'), this.ensureMapLoaded('fallback')]);
    } catch (e) {
      logError(normalizeError(e), `MappingService:initStaticPairs`);
    } finally {
      await Promise.all([this.refreshStaticMapping('primary'), this.refreshStaticMapping('fallback')]);
    }
  }

  public resolveTvdbId(anilistId: number, options: { network?: 'never' } = {}): Promise<ResolvedMapping> {
    if (this.inflight.has(anilistId)) {
      return this.inflight.get(anilistId)!;
    }

    const promise = this.getOrQueueResolution(anilistId, options);
    this.inflight.set(anilistId, promise);

    promise.then(result => {
      const cacheKey = `resolved_mapping:${anilistId}`;
      this.cache.set(cacheKey, result, RESOLVED_STALE, RESOLVED_HARD);
    }).catch(() => {/* Do not cache failures */}).finally(() => {
      this.inflight.delete(anilistId);
    });

    return promise;
  }

  private async getOrQueueResolution(anilistId: number, options: { network?: 'never' } = {}): Promise<ResolvedMapping> {
    const cacheKey = `resolved_mapping:${anilistId}`;
    const cached = await this.cache.get<ResolvedMapping>(cacheKey);
    if (cached) {
      incrementPhase0Counter('cache-hit');
      return cached;
    }

    await Promise.all([this.ensureMapLoaded('primary'), this.ensureMapLoaded('fallback')]);

    const staticHit = this.checkStaticMaps(anilistId);
    if (staticHit) {
      if (staticHit.source === 'primary') incrementPhase0Counter('static-primary');
      else if (staticHit.source === 'fallback') incrementPhase0Counter('static-fallback');
      return { tvdbId: staticHit.tvdbId };
    }

    if (options.network === 'never') {
      throw this.notFound(anilistId, 'Local-only check failed, network access is disabled for this request.');
    }

    return new Promise((resolve, reject) => {
      this.mappingQueue.push({ anilistId, resolve, reject });
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
          const result = await this.performNetworkResolution(req.anilistId);
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

  private async performNetworkResolution(anilistId: number): Promise<ResolvedMapping> {
    const media = await this.anilistApi.fetchMediaWithRelations(anilistId);

    if (media.format === 'MOVIE') {
      throw this.notFound(anilistId, `Unsupported format: ${media.format}. Only TV series can be added to Sonarr.`);
    }

    // Removed: any use of media.externalLinks / TheTVDB direct link

    const prequelRootId = this.findPrequelRoot(media);
    if (prequelRootId !== anilistId) {
      const staticHit = this.checkStaticMaps(prequelRootId);
      if (staticHit) {
        if (staticHit.source === 'primary') incrementPhase0Counter('static-primary');
        else if (staticHit.source === 'fallback') incrementPhase0Counter('static-fallback');
        return { tvdbId: staticHit.tvdbId };
      }
    }

    const startYear = media.startDate?.year ?? undefined;
    const sonarrResult = await this.lookupViaSonarr(anilistId, media.title, media.synonyms, startYear);
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
      // primary wins if present
      // note: we don't increment here to avoid double counting when called from multiple paths
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
    const raw: string[] = [];
    const pushIf = (s?: string) => {
      if (s && s.trim()) raw.push(s);
    };

    pushIf(titles?.english);
    pushIf(titles?.romaji);

    if (Array.isArray(synonyms)) {
      for (let i = 0; i < synonyms.length && i < 4; i++) pushIf(synonyms[i]);
    }

    const seen = new Set<string>();
    const out: string[] = [];

    for (const base of raw) {
      const cleaned = stripParenContent(base).trim();
      const key = normTitle(cleaned);
      if (key.length < 3 || seen.has(key)) continue;
      seen.add(key);

      if (typeof year === 'number') {
        out.push(`${cleaned} ${year}`);
      }
      out.push(cleaned);

      if (out.length >= MAX_TERMS) break;
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
