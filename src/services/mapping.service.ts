// src/services/mapping.service.ts
import type { TtlCache } from '@/cache';
import type { AnilistApiService, AniMedia } from '@/api/anilist.api';
import type { SonarrApiService } from '@/api/sonarr.api';
import type { SonarrLookupSeries } from '@/types';
import type { AniTitles, ExtensionError, MediaMetadataHint } from '@/types';
import { createError, ErrorCode, logError, normalizeError } from '@/utils/error-handling';
import { computeTitleMatchScore, normTitle, stripParenContent } from '@/utils/matching';
import { extensionOptions } from '@/utils/storage';


const PRIMARY_URL = 'https://raw.githubusercontent.com/eliasbenb/PlexAniBridge-Mappings/v2/mappings.json';
const FALLBACK_URL = 'https://raw.githubusercontent.com/Kometa-Team/Anime-IDs/master/anime_ids.json';

const RESOLVED_SOFT_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESOLVED_HARD_TTL = 180 * 24 * 60 * 60 * 1000; // 180 days

const FAILURE_SOFT_TTL = 30 * 60 * 1000; // 30 minutes
const FAILURE_HARD_TTL = FAILURE_SOFT_TTL * 2;
const NETWORK_FAILURE_SOFT_TTL = 5 * 60 * 1000; // 5 minutes
const NETWORK_FAILURE_HARD_TTL = NETWORK_FAILURE_SOFT_TTL * 3;

const STATIC_SOFT_TTL = 24 * 60 * 60 * 1000; // 1 day
const STATIC_HARD_TTL = STATIC_SOFT_TTL * 7;

const MAPPING_BATCH_SIZE = 3;
const MAPPING_BATCH_DELAY_MS = 1500;

const SCORE_THRESHOLD = 0.76;
const EARLY_STOP_THRESHOLD = 0.82;
const MAX_TERMS = 5;

const ALLOWED_FORMATS = new Set(['TV', 'TV_SHORT', 'ONA', 'OVA', 'SPECIAL']);

export interface ResolvedMapping {
  tvdbId: number;
  successfulSynonym?: string;
}

type ResolveHints = {
  primaryTitle?: string;
  domMedia?: MediaMetadataHint | null;
};

type ResolveTvdbIdOptions = {
  network?: 'never';
  hints?: ResolveHints;
  ignoreFailureCache?: boolean;
};

type QueuedMappingRequest = {
  anilistId: number;
  resolve: (value: ResolvedMapping) => void;
  reject: (reason: ExtensionError) => void;
  hints?: ResolveHints;
  bypassFailureCache: boolean;
};

type MappingServiceOptions = {
  delay?: (ms: number) => Promise<void>;
};

export interface StaticMappingPayload {
  pairs: Record<number, number>;
}

interface InflightResolution {
  promise: Promise<ResolvedMapping>;
  bypassFailureCache: boolean;
}

export class MappingService {
  private readonly primaryPairsMap = new Map<number, number>();
  private readonly fallbackPairsMap = new Map<number, number>();

  private readonly inflight = new Map<number, InflightResolution>();
  private readonly mappingQueue: QueuedMappingRequest[] = [];
  private isProcessingMappingQueue = false;
  private readonly delayFn: (ms: number) => Promise<void>;

  constructor(
    private readonly sonarrApi: SonarrApiService,
    private readonly anilistApi: AnilistApiService,
    private readonly caches: {
      success: TtlCache<ResolvedMapping>;
      failure: TtlCache<ExtensionError>;
      staticPrimary: TtlCache<StaticMappingPayload>;
      staticFallback: TtlCache<StaticMappingPayload>;
    },
    options: MappingServiceOptions = {},
  ) {
    this.delayFn = options.delay ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
  }

  public async initStaticPairs(): Promise<void> {
    await Promise.all([this.ensureMapLoaded('primary'), this.ensureMapLoaded('fallback')]);

    // Kick background refresh without blocking callers.
    this.refreshStaticMapping('primary').catch(error => {
      logError(normalizeError(error), 'MappingService:initStaticPairs:primaryRefresh');
    });
    this.refreshStaticMapping('fallback').catch(error => {
      logError(normalizeError(error), 'MappingService:initStaticPairs:fallbackRefresh');
    });
  }

  public resolveTvdbId(anilistId: number, options: ResolveTvdbIdOptions = {}): Promise<ResolvedMapping> {
    const bypassFailureCache = options.ignoreFailureCache === true;
    const existing = this.inflight.get(anilistId);

    if (existing) {
      if (bypassFailureCache && !existing.bypassFailureCache) {
        // If a bypass is requested while a cached resolution is in flight, allow the existing promise to complete first.
      }
      return existing.promise;
    }

    const promise = this.resolveTvdbIdInternal(anilistId, options, bypassFailureCache);
    this.inflight.set(anilistId, { promise, bypassFailureCache });

    promise.finally(() => {
      const current = this.inflight.get(anilistId);
      if (current?.promise === promise) {
        this.inflight.delete(anilistId);
      }
    });

    return promise;
  }

  private async resolveTvdbIdInternal(
    anilistId: number,
    options: ResolveTvdbIdOptions,
    bypassFailureCache: boolean,
  ): Promise<ResolvedMapping> {
    const cacheKey = this.successCacheKey(anilistId);

    const cachedSuccess = await this.caches.success.read(cacheKey);
    if (cachedSuccess) {
      return cachedSuccess.value;
    }

    if (!bypassFailureCache) {
      const cachedFailure = await this.caches.failure.read(this.failureCacheKey(anilistId));
      if (cachedFailure) {
        throw cachedFailure.value;
      }
    }

    const staticHit = this.lookupStatic(anilistId);
    if (staticHit) {
      await this.caches.success.write(cacheKey, staticHit.mapping, {
        staleMs: RESOLVED_SOFT_TTL,
        hardMs: RESOLVED_HARD_TTL,
      });
      return staticHit.mapping;
    }

    if (options.network === 'never') {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        `AniList ID ${anilistId} requires a network lookup but network access is disabled.`,
        'Unable to resolve this title without contacting Sonarr.',
      );
    }

    const hintTerm = options.hints?.primaryTitle?.trim();
    if (hintTerm) {
      try {
        const hinted = await this.tryHintLookup(anilistId, hintTerm);
        if (hinted) {
          await this.caches.success.write(cacheKey, hinted, {
            staleMs: RESOLVED_SOFT_TTL,
            hardMs: RESOLVED_HARD_TTL,
          });
          return hinted;
        }
      } catch (error) {
        logError(normalizeError(error), `MappingService:hintLookup:${anilistId}`);
      }
    }

    return this.enqueueNetworkResolution(anilistId, options.hints, bypassFailureCache);
  }

  private enqueueNetworkResolution(
    anilistId: number,
    hints: ResolveHints | undefined,
    bypassFailureCache: boolean,
  ): Promise<ResolvedMapping> {
    return new Promise<ResolvedMapping>((resolve, reject) => {
      const request: QueuedMappingRequest = {
        anilistId,
        resolve,
        reject,
        bypassFailureCache,
      };
      if (hints) {
        request.hints = hints;
      }
      this.mappingQueue.push(request);
      this.processQueue().catch(error => {
        logError(normalizeError(error), 'MappingService:processQueue');
      });
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingMappingQueue) return;
    this.isProcessingMappingQueue = true;

    try {
      while (this.mappingQueue.length > 0) {
        const batch = this.mappingQueue.splice(0, MAPPING_BATCH_SIZE);
        await Promise.all(batch.map(req => this.handleNetworkRequest(req)));
        if (this.mappingQueue.length > 0) {
          await this.delay(MAPPING_BATCH_DELAY_MS);
        }
      }
    } finally {
      this.isProcessingMappingQueue = false;
    }
  }

  private async handleNetworkRequest(request: QueuedMappingRequest): Promise<void> {
    const cacheKey = this.successCacheKey(request.anilistId);

    try {
      const mapping = await this.resolveViaNetwork(request.anilistId, request.hints);
      await this.caches.success.write(cacheKey, mapping, {
        staleMs: RESOLVED_SOFT_TTL,
        hardMs: RESOLVED_HARD_TTL,
      });
      request.resolve(mapping);
    } catch (error) {
      const normalized = normalizeError(error);
      if (!request.bypassFailureCache && this.shouldCacheFailure(normalized)) {
        const ttl = this.failureTtlsFor(normalized);
        await this.caches.failure.write(this.failureCacheKey(request.anilistId), normalized, {
          staleMs: ttl.stale,
          hardMs: ttl.hard,
        });
      }
      request.reject(normalized);
    }
  }

  private async resolveViaNetwork(anilistId: number, hints?: ResolveHints): Promise<ResolvedMapping> {
    const credentials = await this.getConfiguredCredentials();

    const metadataMedia = this.buildMediaFromMetadataHint(anilistId, hints?.domMedia);
    if (metadataMedia) {
      const resolved = await this.tryResolveWithPreparedMedia(anilistId, metadataMedia, credentials, hints);
      if (resolved) {
        return resolved;
      }
    }

    const apiMedia = await this.anilistApi.fetchMediaWithRelations(anilistId);
    const apiResolved = await this.tryResolveWithPreparedMedia(anilistId, apiMedia, credentials, hints);
    if (apiResolved) {
      return apiResolved;
    }

    throw createError(
      ErrorCode.VALIDATION_ERROR,
      `Sonarr lookup yielded no match for AniList ID ${anilistId}.`,
      'Could not find a matching series on TheTVDB.',
    );
  }

  private async tryResolveWithPreparedMedia(
    anilistId: number,
    media: AniMedia,
    credentials: { url: string; apiKey: string },
    hints?: ResolveHints,
  ): Promise<ResolvedMapping | null> {
    if (media.format && !ALLOWED_FORMATS.has(media.format)) {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        `Unsupported AniList format (${media.format}) for AniList ID ${anilistId}.`,
        'This title is not a supported Sonarr series format.',
      );
    }

    const prequelStatic = this.lookupPrequelStatic(media);
    if (prequelStatic) {
      return prequelStatic.mapping;
    }

    const searchTerms = this.buildSearchTerms(media.title, media.synonyms, media.startDate?.year ?? undefined);
    if (hints?.primaryTitle) {
      const trimmed = hints.primaryTitle.trim();
      if (trimmed.length > 0) {
        searchTerms.unshift(trimmed);
      }
    }

    let bestMatch: { tvdbId: number; term: string; score: number } | null = null;

    for (const term of searchTerms.slice(0, MAX_TERMS)) {
      const results = await this.safeLookup(term, credentials);

      for (const candidate of results) {
        const mediaYear = media.startDate?.year;
        const scoreParams = {
          queryRaw: term,
          candidateRaw: candidate.title,
          ...(typeof candidate.year === 'number' ? { candidateYear: candidate.year } : {}),
          ...(typeof mediaYear === 'number' ? { targetYear: mediaYear } : {}),
          ...(Array.isArray(candidate.genres) ? { candidateGenres: candidate.genres } : {}),
        } satisfies Parameters<typeof computeTitleMatchScore>[0];
        const score = computeTitleMatchScore(scoreParams);

        if (score >= EARLY_STOP_THRESHOLD) {
          bestMatch = { tvdbId: candidate.tvdbId, term, score };
          break;
        }

        if (score >= SCORE_THRESHOLD) {
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { tvdbId: candidate.tvdbId, term, score };
          }
        }
      }

      if (bestMatch && bestMatch.score >= EARLY_STOP_THRESHOLD) {
        break;
      }
    }

    if (bestMatch) {
      return { tvdbId: bestMatch.tvdbId, successfulSynonym: bestMatch.term };
    }

    return null;
  }

  private buildMediaFromMetadataHint(anilistId: number, metadata?: MediaMetadataHint | null): AniMedia | null {
    if (!metadata) return null;

    const titlesSource = metadata.titles ?? null;
    const titles: AniTitles = {};
    if (titlesSource?.english) titles.english = titlesSource.english;
    if (titlesSource?.romaji) titles.romaji = titlesSource.romaji;
    if (titlesSource?.native) titles.native = titlesSource.native;

    const synonyms = Array.isArray(metadata.synonyms)
      ? Array.from(
          new Set(
            metadata.synonyms
              .filter((value): value is string => typeof value === 'string')
              .map(value => value.trim())
              .filter(value => value.length > 0),
          ),
        )
      : [];

    const startYear = typeof metadata.startYear === 'number' && Number.isFinite(metadata.startYear)
      ? metadata.startYear
      : null;

    const format = metadata.format ?? null;

    const relationIds = Array.isArray(metadata.relationPrequelIds)
      ? metadata.relationPrequelIds.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      : [];

    if (
      Object.keys(titles).length === 0 &&
      synonyms.length === 0 &&
      startYear == null &&
      !format &&
      relationIds.length === 0
    ) {
      return null;
    }

    const relations = relationIds.length > 0
      ? {
          edges: relationIds.map(id => ({
            relationType: 'PREQUEL',
            node: {
              id,
              format: null,
              title: {},
              synonyms: [],
            } as AniMedia,
          })),
        }
      : undefined;

    const startDate = startYear != null ? { year: startYear } : undefined;

    return {
      id: anilistId,
      format,
      title: Object.keys(titles).length > 0 ? titles : {},
      ...(startDate ? { startDate } : {}),
      synonyms,
      ...(relations ? { relations } : {}),
    };
  }

  private async tryHintLookup(anilistId: number, term: string): Promise<ResolvedMapping | null> {
    if (!term.trim()) return null;

    let credentials: { url: string; apiKey: string };
    try {
      credentials = await this.getConfiguredCredentials();
    } catch {
      return null;
    }

    const results = await this.safeLookup(term, credentials);

    for (const candidate of results) {
      const scoreParams = {
        queryRaw: term,
        candidateRaw: candidate.title,
        ...(typeof candidate.year === 'number' ? { candidateYear: candidate.year } : {}),
      } satisfies Parameters<typeof computeTitleMatchScore>[0];

      const score = computeTitleMatchScore(scoreParams);

      if (score >= SCORE_THRESHOLD) {
        return { tvdbId: candidate.tvdbId, successfulSynonym: term };
      }
    }

    return null;
  }

  private async safeLookup(term: string, credentials: { url: string; apiKey: string }): Promise<SonarrLookupSeries[]> {
    try {
      return await this.sonarrApi.lookupSeriesByTerm(term, credentials);
    } catch (error) {
      throw normalizeError(error);
    }
  }

  private async getConfiguredCredentials(): Promise<{ url: string; apiKey: string }> {
    const opts = await extensionOptions.getValue();
    if (!opts?.sonarrUrl || !opts?.sonarrApiKey) {
      throw createError(
        ErrorCode.CONFIGURATION_ERROR,
        'Sonarr URL or API key not configured.',
        'Configure your Sonarr connection in Kitsunarr options.',
      );
    }
    return { url: opts.sonarrUrl, apiKey: opts.sonarrApiKey };
  }

  private lookupStatic(anilistId: number): { mapping: ResolvedMapping; metricKey: 'static-primary' | 'static-fallback' } | null {
    const primary = this.primaryPairsMap.get(anilistId);
    if (typeof primary === 'number') {
      return { mapping: { tvdbId: primary }, metricKey: 'static-primary' };
    }

    const fallback = this.fallbackPairsMap.get(anilistId);
    if (typeof fallback === 'number') {
      return { mapping: { tvdbId: fallback }, metricKey: 'static-fallback' };
    }

    return null;
  }

  private lookupPrequelStatic(media: AniMedia): { mapping: ResolvedMapping; metricKey: 'static-primary' | 'static-fallback' } | null {
    const visited = new Set<number>();
    let current: AniMedia | undefined = media;

    while (current) {
      const staticHit = this.lookupStatic(current.id);
      if (staticHit) {
        if (current.id !== media.id) {
          return staticHit;
        }
        break;
      }

      const edges: { relationType: string; node: AniMedia }[] = current.relations?.edges ?? [];
      const prequelEdge = edges.find(
        (edge): edge is { relationType: string; node: AniMedia } => edge.relationType === 'PREQUEL',
      );
      const prequelNode = prequelEdge?.node;
      if (!prequelNode || visited.has(prequelNode.id)) break;

      visited.add(prequelNode.id);
      current = prequelNode;
    }

    return null;
  }

  private successCacheKey(anilistId: number): string {
    return `resolved:${anilistId}`;
  }

  private failureCacheKey(anilistId: number): string {
    return `resolved-failure:${anilistId}`;
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
      return { stale: NETWORK_FAILURE_SOFT_TTL, hard: NETWORK_FAILURE_HARD_TTL };
    }
    return { stale: FAILURE_SOFT_TTL, hard: FAILURE_HARD_TTL };
  }

  private async ensureMapLoaded(type: 'primary' | 'fallback'): Promise<void> {
    const map = type === 'primary' ? this.primaryPairsMap : this.fallbackPairsMap;
    if (map.size > 0) return;

    const cache = type === 'primary' ? this.caches.staticPrimary : this.caches.staticFallback;
    const cached = await cache.read('static');
    if (cached) {
      this.hydrateMap(map, cached.value.pairs);
    }
  }

  private async refreshStaticMapping(type: 'primary' | 'fallback'): Promise<void> {
    const cache = type === 'primary' ? this.caches.staticPrimary : this.caches.staticFallback;
    const map = type === 'primary' ? this.primaryPairsMap : this.fallbackPairsMap;
    const url = type === 'primary' ? PRIMARY_URL : FALLBACK_URL;

    try {
      const cached = await cache.read('static');
      const headers: Record<string, string> = {};
      const etag = cached?.meta?.etag as string | undefined;
      if (etag) {
        headers['If-None-Match'] = etag;
      }

      const response = await fetch(url, { headers });
      if (response.status === 304 && cached) {
        if (map.size === 0) {
          this.hydrateMap(map, cached.value.pairs);
        }
        return;
      }

      if (!response.ok) {
        throw createError(ErrorCode.NETWORK_ERROR, `Failed to fetch static mapping (${response.status})`, 'Unable to refresh static mappings.');
      }

      const json = (await response.json()) as unknown;
      const pairs = this.buildPairsFromSource(json);
      this.hydrateMap(map, pairs);

      const nextEtag = response.headers.get('ETag');
      await cache.write('static', { pairs }, {
        staleMs: STATIC_SOFT_TTL,
        hardMs: STATIC_HARD_TTL,
        ...(nextEtag ? { meta: { etag: nextEtag } } : {}),
      });
    } catch (error) {
      logError(normalizeError(error), `MappingService:refreshStatic:${type}`);
    }
  }

  private hydrateMap(map: Map<number, number>, pairs: Record<number, number>): void {
    map.clear();
    for (const [key, value] of Object.entries(pairs)) {
      const k = Number(key);
      if (!Number.isFinite(k) || !Number.isFinite(value)) continue;
      map.set(k, value);
    }
  }

  private buildPairsFromSource(source: unknown): Record<number, number> {
    const pairs: Record<number, number> = {};
    if (!source || typeof source !== 'object') return pairs;

    const entries = Array.isArray(source) ? source : Object.values(source as Record<string, unknown>);

    for (const rawEntry of entries) {
      if (!rawEntry || typeof rawEntry !== 'object') continue;
      const entry = rawEntry as Record<string, unknown>;
      const anilistId = this.coerceId(entry.anilist_id ?? entry.anilist ?? entry.aniId);
      const tvdbId = this.coerceId(entry.tvdb_id ?? entry.tvdb ?? entry.tvdbid);
      if (anilistId != null && tvdbId != null) {
        pairs[anilistId] = tvdbId;
      }
    }

    return pairs;
  }

  private coerceId(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value | 0;
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) return parsed | 0;
    }
    return null;
  }

  private buildSearchTerms(titles: AniTitles, synonyms: string[] | undefined, startYear?: number | null): string[] {
    const seen = new Set<string>();
    const terms: string[] = [];

    const addTerm = (term: string) => {
      const normalized = normTitle(term);
      if (!normalized) return;
      if (seen.has(normalized)) return;
      seen.add(normalized);
      terms.push(term);
    };

    const baseTitles: string[] = [];
    if (titles.english) baseTitles.push(titles.english);
    if (titles.romaji) baseTitles.push(titles.romaji);
    if (synonyms) baseTitles.push(...synonyms);

    for (const title of baseTitles) {
      const stripped = stripParenContent(title).trim();
      if (!stripped) continue;
      addTerm(stripped);
      if (startYear) {
        addTerm(`${stripped} ${startYear}`);
      }
    }

    return terms;
  }

  private delay(ms: number): Promise<void> {
    return this.delayFn(ms);
  }
}




