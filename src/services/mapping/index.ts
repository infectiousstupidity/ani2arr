// src/services/mapping/index.ts
import type { TtlCache } from '@/cache';
import type { AnilistApiService, AniMedia } from '@/api/anilist.api';
import type { ExtensionError, MediaMetadataHint, AniTitles } from '@/types';
import { createError, ErrorCode, logError, normalizeError } from '@/utils/error-handling';
import { extensionOptions } from '@/utils/storage';
import { incrementCounter } from '@/utils/metrics';
import { logger } from '@/utils/logger';
import { canonicalTitleKey, sanitizeLookupDisplay } from '@/utils/matching';
import { StaticMappingProvider, type StaticMappingPayload } from './static-mapping.provider';
import { SonarrLookupClient, type SonarrLookupCredentials } from './sonarr-lookup.client';
import { isSeasonalCanonicalTokens } from './search-term-generator';
import { resolveViaPipeline } from './pipeline';
import { scoreCandidates } from './scoring';

const RESOLVED_SOFT_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESOLVED_HARD_TTL = 180 * 24 * 60 * 60 * 1000; // 180 days

const FAILURE_SOFT_TTL = 30 * 60 * 1000; // 30 minutes
const FAILURE_HARD_TTL = FAILURE_SOFT_TTL * 2;
const NETWORK_FAILURE_SOFT_TTL = 5 * 60 * 1000; // 5 minutes
const NETWORK_FAILURE_HARD_TTL = NETWORK_FAILURE_SOFT_TTL * 3;

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

export class MappingService {
  private readonly log = logger.create('MappingService');
  private readonly inflight = new Map<number, Promise<ResolvedMapping | null>>();
  private readonly sessionSeenCanonical = new Set<string>();

  constructor(
    private readonly anilistApi: AnilistApiService,
    private readonly staticProvider: StaticMappingProvider,
    private readonly lookupClient: SonarrLookupClient,
    private readonly caches: {
      success: TtlCache<ResolvedMapping>;
      failure: TtlCache<ExtensionError>;
    },
  ) {}

  public async resetLookupState(): Promise<void> {
    await Promise.all([this.lookupClient.reset(), this.caches.failure.clear()]);
    this.inflight.clear();
    this.sessionSeenCanonical.clear();
  }

  public initStaticPairs(): Promise<void> {
    return this.staticProvider.init();
  }

  /**
   * Resolve AniList ID to TVDB ID. Returns null if no mapping is found (expected case).
   * Still throws for genuine errors (network, permission, config, api errors).
   */
  public resolveTvdbId(anilistId: number, options: ResolveTvdbIdOptions = {}): Promise<ResolvedMapping | null> {
    const bypassFailureCache = options.ignoreFailureCache === true;
    const existing = this.inflight.get(anilistId);
    if (existing) {
      return existing;
    }

    const promise = this.resolveTvdbIdInternal(anilistId, options, bypassFailureCache);
    this.inflight.set(anilistId, promise);

    promise.finally(() => {
      const current = this.inflight.get(anilistId);
      if (current === promise) {
        this.inflight.delete(anilistId);
      }
    });

    return promise;
  }

  private async resolveTvdbIdInternal(
    anilistId: number,
    options: ResolveTvdbIdOptions,
    bypassFailureCache: boolean,
  ): Promise<ResolvedMapping | null> {
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

    const staticHit = this.staticProvider.get(anilistId);
    if (staticHit) {
      incrementCounter('mapping.lookup.static_hit');
      await this.caches.success.write(cacheKey, { tvdbId: staticHit.tvdbId }, {
        staleMs: RESOLVED_SOFT_TTL,
        hardMs: RESOLVED_HARD_TTL,
      });
      this.evictAniListMedia(anilistId);
      return { tvdbId: staticHit.tvdbId };
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
        const hinted = await this.tryHintLookup(hintTerm);
        if (hinted) {
          await this.caches.success.write(cacheKey, hinted, {
            staleMs: RESOLVED_SOFT_TTL,
            hardMs: RESOLVED_HARD_TTL,
          });
          this.evictAniListMedia(anilistId);
          return hinted;
        }
      } catch (error) {
        logError(normalizeError(error), `MappingService:hintLookup:${anilistId}`);
      }
    }

    let resolved: ResolvedMapping | null;
    try {
      resolved = await this.resolveViaNetwork(anilistId, options.hints);
    } catch (error) {
      const normalized = normalizeError(error);
      // VALIDATION_ERROR means no match found (expected) — return null instead of throwing
      if (normalized.code === ErrorCode.VALIDATION_ERROR) {
        if (!bypassFailureCache) {
          const ttl = this.failureTtlsFor(normalized);
          await this.caches.failure.write(this.failureCacheKey(anilistId), normalized, {
            staleMs: ttl.stale,
            hardMs: ttl.hard,
          });
        }
        return null;
      }
      // Real errors (network, config, permission) still throw
      if (!bypassFailureCache && this.shouldCacheFailure(normalized)) {
        const ttl = this.failureTtlsFor(normalized);
        await this.caches.failure.write(this.failureCacheKey(anilistId), normalized, {
          staleMs: ttl.stale,
          hardMs: ttl.hard,
        });
      }
      throw normalized;
    }

    if (resolved === null) {
      return null;
    }

    await this.caches.success.write(cacheKey, resolved, {
      staleMs: RESOLVED_SOFT_TTL,
      hardMs: RESOLVED_HARD_TTL,
    });
    this.evictAniListMedia(anilistId);
    return resolved;
  }

  private evictAniListMedia(anilistId: number): void {
    try {
      const anyApi = this.anilistApi as unknown as { removeMediaFromCache?: (id: number) => Promise<void> };
      if (anyApi && typeof anyApi.removeMediaFromCache === 'function') {
        void anyApi.removeMediaFromCache(anilistId).catch(() => {});
      }
    } catch {
      // best-effort eviction; ignore failures
    }
  }

  private async resolveViaNetwork(anilistId: number, hints?: ResolveHints): Promise<ResolvedMapping | null> {
    const credentials = await this.getConfiguredCredentials();

    const metadataMedia = this.buildMediaFromMetadataHint(anilistId, hints?.domMedia);
    if (metadataMedia) {
      const resolved = await this.tryResolveWithMedia(metadataMedia, credentials, hints);
      if (resolved) {
        return resolved;
      }
    }

    const apiMedia = await this.anilistApi.fetchMediaWithRelations(anilistId);
    const apiResolved = await this.tryResolveWithMedia(apiMedia, credentials, hints);
    if (apiResolved) {
      return apiResolved;
    }

    // No match found — return null (expected case, not an error)
    this.log.debug(`resolveViaNetwork: no match found for AniList ID ${anilistId}`);
    return null;
  }

  private async tryResolveWithMedia(
    media: AniMedia,
    credentials: SonarrLookupCredentials,
    hints?: ResolveHints,
  ): Promise<ResolvedMapping | null> {
    if (media.format && !ALLOWED_FORMATS.has(media.format)) {
      // Unsupported format — return null (not an error, just not mappable)
      this.log.debug(`tryResolveWithMedia: unsupported format '${media.format}' for AniList ID ${media.id}`);
      return null;
    }

    const prequelStatic = await this.lookupPrequelStatic(media);
    if (prequelStatic) {
      return prequelStatic;
    }

    const outcome = await resolveViaPipeline(media, {
      anilistApi: this.anilistApi,
      lookupClient: this.lookupClient,
      staticProvider: this.staticProvider,
      credentials,
      sessionSeenCanonical: this.sessionSeenCanonical,
      limits: {
        maxTerms: 5,
        scoreThreshold: 0.76,
        earlyStopThreshold: 0.82,
      },
      log: this.log,
    }, hints?.primaryTitle);

    if (outcome.status === 'resolved') {
      return {
        tvdbId: outcome.tvdbId,
        ...(outcome.successfulSynonym ? { successfulSynonym: outcome.successfulSynonym } : {}),
      };
    }
    return null;
  }

  private async lookupPrequelStatic(media: AniMedia): Promise<ResolvedMapping | null> {
    const directHit = this.staticProvider.get(media.id);
    if (directHit) {
      return { tvdbId: directHit.tvdbId };
    }

    const visited = new Set<number>([media.id]);

    for await (const prequel of this.anilistApi.iteratePrequelChain(media)) {
      if (visited.has(prequel.id)) {
        continue;
      }
      const hit = this.staticProvider.get(prequel.id);
      if (hit) {
        return { tvdbId: hit.tvdbId };
      }
      visited.add(prequel.id);
    }

    return null;
  }

  private async tryHintLookup(term: string): Promise<ResolvedMapping | null> {
    const trimmed = term.trim();
    const sanitized = sanitizeLookupDisplay(trimmed);
    if (!sanitized) return null;

    let credentials: SonarrLookupCredentials;
    try {
      credentials = await this.getConfiguredCredentials();
    } catch {
      return null;
    }

    const canonical = canonicalTitleKey(sanitized) ?? '';
    const canonicalTokens = canonical.split(/\s+/).filter(Boolean);
    if (canonicalTokens.length === 0 || isSeasonalCanonicalTokens(canonicalTokens)) {
      return null;
    }
    const results = await this.lookupClient.lookup(canonical, sanitized, credentials);
    const scored = scoreCandidates({ canonical, display: sanitized }, results);
    const top = scored[0];
    if (top && top.score >= 0.76) {
      return { tvdbId: top.result.tvdbId, successfulSynonym: sanitized };
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

    const startYear =
      typeof metadata.startYear === 'number' && Number.isFinite(metadata.startYear)
        ? metadata.startYear
        : null;

    const format = metadata.format ?? null;

    const relationIds = Array.isArray(metadata.relationPrequelIds)
      ? metadata.relationPrequelIds.filter(
          (value): value is number => typeof value === 'number' && Number.isFinite(value),
        )
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

    const relations =
      relationIds.length > 0
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

  private async getConfiguredCredentials(): Promise<SonarrLookupCredentials> {
    const opts = await extensionOptions.getValue();
    if (!opts?.sonarrUrl || !opts?.sonarrApiKey) {
      throw createError(
        ErrorCode.SONARR_NOT_CONFIGURED,
        'Sonarr credentials are not configured.',
        'Configure your Sonarr connection in Kitsunarr options.',
      );
    }
    return { url: opts.sonarrUrl, apiKey: opts.sonarrApiKey };
  }
}

export type { StaticMappingPayload };
