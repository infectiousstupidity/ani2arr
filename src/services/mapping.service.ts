// src/services/mapping.service.ts
import type { TtlCache } from '@/cache';
import type { AnilistApiService, AniMedia } from '@/api/anilist.api';
import type { ExtensionError, MediaMetadataHint, AniTitles, SonarrLookupSeries } from '@/types';
import { createError, ErrorCode, logError, normalizeError } from '@/utils/error-handling';
import { extensionOptions } from '@/utils/storage';
import { incrementCounter } from '@/utils/metrics';
import { logger } from '@/utils/logger';
import { canonicalTitleKey, computeTitleMatchScore, sanitizeLookupDisplay } from '@/utils/matching';
import { StaticMappingProvider, type StaticMappingPayload } from './mapping/static-mapping.provider';
import {
  SonarrLookupClient,
  type SonarrLookupCredentials,
} from './mapping/sonarr-lookup.client';
import { generateSearchTerms, isSeasonalCanonicalTokens } from './mapping/search-term-generator';

const RESOLVED_SOFT_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESOLVED_HARD_TTL = 180 * 24 * 60 * 60 * 1000; // 180 days

const FAILURE_SOFT_TTL = 30 * 60 * 1000; // 30 minutes
const FAILURE_HARD_TTL = FAILURE_SOFT_TTL * 2;
const NETWORK_FAILURE_SOFT_TTL = 5 * 60 * 1000; // 5 minutes
const NETWORK_FAILURE_HARD_TTL = NETWORK_FAILURE_SOFT_TTL * 3;

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

export class MappingService {
  private readonly log = logger.create('MappingService');
  private readonly inflight = new Map<number, Promise<ResolvedMapping>>();
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

  public resolveTvdbId(anilistId: number, options: ResolveTvdbIdOptions = {}): Promise<ResolvedMapping> {
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

    const staticHit = this.staticProvider.get(anilistId);
    if (staticHit) {
      incrementCounter('mapping.lookup.static_hit');
      await this.caches.success.write(cacheKey, { tvdbId: staticHit.tvdbId }, {
        staleMs: RESOLVED_SOFT_TTL,
        hardMs: RESOLVED_HARD_TTL,
      });
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
          return hinted;
        }
      } catch (error) {
        logError(normalizeError(error), `MappingService:hintLookup:${anilistId}`);
      }
    }

    let resolved: ResolvedMapping;
    try {
      resolved = await this.resolveViaNetwork(anilistId, options.hints);
    } catch (error) {
      const normalized = normalizeError(error);
      if (!bypassFailureCache && this.shouldCacheFailure(normalized)) {
        const ttl = this.failureTtlsFor(normalized);
        await this.caches.failure.write(this.failureCacheKey(anilistId), normalized, {
          staleMs: ttl.stale,
          hardMs: ttl.hard,
        });
      }
      throw normalized;
    }

    await this.caches.success.write(cacheKey, resolved, {
      staleMs: RESOLVED_SOFT_TTL,
      hardMs: RESOLVED_HARD_TTL,
    });
    return resolved;
  }

  private async resolveViaNetwork(anilistId: number, hints?: ResolveHints): Promise<ResolvedMapping> {
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

    throw createError(
      ErrorCode.VALIDATION_ERROR,
      `Sonarr lookup yielded no match for AniList ID ${anilistId}.`,
      'Could not find a matching series on TheTVDB.',
    );
  }

  private async tryResolveWithMedia(
    media: AniMedia,
    credentials: SonarrLookupCredentials,
    hints?: ResolveHints,
  ): Promise<ResolvedMapping | null> {
    if (media.format && !ALLOWED_FORMATS.has(media.format)) {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        `Unsupported AniList format (${media.format}) for AniList ID ${media.id}.`,
        'This title is not a supported Sonarr series format.',
      );
    }

    const prequelStatic = await this.lookupPrequelStatic(media);
    if (prequelStatic) {
      return prequelStatic;
    }

    const mediaYear = media.startDate?.year ?? undefined;
    const searchTerms = generateSearchTerms(media.title ?? ({} as AniTitles), media.synonyms);

    if (hints?.primaryTitle) {
      const trimmed = hints.primaryTitle.trim();
      if (trimmed.length > 0) {
        const sanitizedHint = sanitizeLookupDisplay(trimmed);
        if (sanitizedHint) {
          const canonicalHint = canonicalTitleKey(sanitizedHint);
          if (canonicalHint) {
            const canonicalTokens = canonicalHint.split(/\s+/).filter(Boolean);
            if (canonicalTokens.length > 0 && !isSeasonalCanonicalTokens(canonicalTokens)) {
              const existingIndex = searchTerms.findIndex(value => value.canonical === canonicalHint);
              if (existingIndex >= 0) {
                searchTerms.splice(existingIndex, 1);
              }
              searchTerms.unshift({ canonical: canonicalHint, display: sanitizedHint });
            }
          }
        }
      }
    }

    let bestMatch: { tvdbId: number; term: string; score: number } | null = null;

    for (const term of searchTerms.slice(0, MAX_TERMS)) {
      if (!term.canonical) continue;

      const seenInSession = this.sessionSeenCanonical.has(term.canonical);
      const baseResults = seenInSession
        ? await this.lookupClient.readFromCache(term.canonical)
        : await this.lookupClient.lookup(term.canonical, term.display, credentials);

      const { bestCandidate } = this.evaluateLookupResults(baseResults, term.display, mediaYear);

      if (bestCandidate && (!bestMatch || bestCandidate.score > bestMatch.score)) {
        bestMatch = bestCandidate;
      }

      if (!seenInSession) {
        this.sessionSeenCanonical.add(term.canonical);
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
    const { bestCandidate } = this.evaluateLookupResults(results, sanitized);
    if (bestCandidate) {
      return { tvdbId: bestCandidate.tvdbId, successfulSynonym: sanitized };
    }
    return null;
  }

  private evaluateLookupResults(
    results: SonarrLookupSeries[],
    term: string,
    targetYear?: number,
  ): {
    bestCandidate: { tvdbId: number; term: string; score: number } | null;
    topScore: number;
  } {
    let bestCandidate: { tvdbId: number; term: string; score: number } | null = null;
    let topScore = 0;

    for (const candidate of results) {
      const scoreParams = {
        queryRaw: term,
        candidateRaw: candidate.title,
        ...(typeof candidate.year === 'number' ? { candidateYear: candidate.year } : {}),
        ...(typeof targetYear === 'number' ? { targetYear } : {}),
        ...(Array.isArray(candidate.genres) ? { candidateGenres: candidate.genres } : {}),
      } satisfies Parameters<typeof computeTitleMatchScore>[0];

      const score = computeTitleMatchScore(scoreParams);
      if (score > topScore) {
        topScore = score;
      }
      if (score >= SCORE_THRESHOLD && (!bestCandidate || score > bestCandidate.score)) {
        bestCandidate = { tvdbId: candidate.tvdbId, term, score };
      }
    }

    return { bestCandidate, topScore };
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
