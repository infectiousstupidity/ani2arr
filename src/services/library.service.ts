// src/services/library.service.ts
import type { TtlCache } from '@/cache';
import type { SonarrApiService } from '@/api/sonarr.api';
import type { MappingService } from './mapping';
import type {
  CheckSeriesStatusPayload,
  CheckSeriesStatusResponse,
  ExtensionOptions,
  LeanSonarrSeries,
  SonarrSeries,
  RequestPriority,
} from '@/types';
import { ErrorCode, logError, normalizeError } from '@/utils/error-handling';
import { canonicalizeLookupTerm, computeTitleMatchScore, stripParenContent, sanitizeLookupDisplay } from '@/utils/matching';
import { getExtensionOptionsSnapshot } from '@/utils/storage';
import { incrementCounter } from '@/utils/metrics';

const CACHE_KEY = 'sonarr:lean-series';
const SOFT_TTL = 60 * 60 * 1000; // 1h
const HARD_TTL = 24 * 60 * 60 * 1000; // 24h
const ERROR_TTL = 5 * 60 * 1000; // 5m
const LOCAL_INDEX_ACCEPTANCE_THRESHOLD = 0.8;
type LibraryMutationPayload = {
  tvdbId: number;
  action: 'added' | 'removed';
};

export class LibraryService {
  private inflightRefresh: Promise<LeanSonarrSeries[]> | null = null;
  private tvdbSet: Set<number> = new Set();
  private normalizedTitleIndex: Map<string, number | null> = new Map();
  private leanSeriesByTvdbId: Map<number, LeanSonarrSeries> = new Map();

  constructor(
    private readonly sonarrClient: SonarrApiService,
    private readonly mappingService: MappingService,
    private readonly cache: TtlCache<LeanSonarrSeries[]>,
    private readonly emitLibraryMutation?: (payload: LibraryMutationPayload) => Promise<void> | void,
  ) {}

  private async notifyLibraryMutation(payload: LibraryMutationPayload): Promise<void> {
    if (!this.emitLibraryMutation) return;
    try {
      await this.emitLibraryMutation(payload);
    } catch (error) {
      logError(normalizeError(error), 'LibraryService:notifyLibraryMutation');
    }
  }

  public async getLeanSeriesList(): Promise<LeanSonarrSeries[]> {
    const cached = await this.cache.read(CACHE_KEY);
    if (cached) {
      this.ensureIndexes(cached.value);
      if (cached.stale && !this.inflightRefresh) {
        this.refreshCache().catch(error => {
          logError(normalizeError(error), 'LibraryService:backgroundRefresh');
        });
      }
      return cached.value;
    }

    return this.refreshCache();
  }

  public async refreshCache(optionsOverride?: ExtensionOptions): Promise<LeanSonarrSeries[]> {
    if (this.inflightRefresh) return this.inflightRefresh;

    const job = (async () => {
      const cached = await this.cache.read(CACHE_KEY);
      const fallbackList = cached?.value ?? [];

      try {
        const options = optionsOverride ?? (await getExtensionOptionsSnapshot());
        if (!options?.sonarrUrl || !options?.sonarrApiKey) {
          this.resetIndexes();
          await this.cache.write(CACHE_KEY, [], { staleMs: SOFT_TTL, hardMs: HARD_TTL });
          return [];
        }

        const credentials = { url: options.sonarrUrl, apiKey: options.sonarrApiKey };
        const fullSeriesList = await this.sonarrClient.getAllSeries(credentials);
        const leanList: LeanSonarrSeries[] = fullSeriesList
          .filter(series => typeof series.tvdbId === 'number' && Number.isFinite(series.tvdbId))
          .map(series => this.toLeanSeries(series));

        this.ensureIndexes(leanList, true);
        await this.cache.write(CACHE_KEY, leanList, { staleMs: SOFT_TTL, hardMs: HARD_TTL });
        return leanList;
      } catch (error) {
        const normalized = normalizeError(error);
        logError(normalized, 'LibraryService:refreshCache');

        await this.cache.write(CACHE_KEY, fallbackList, {
          staleMs: ERROR_TTL,
          hardMs: ERROR_TTL * 2,
          meta: { lastErrorCode: normalized.code },
        });

        this.ensureIndexes(fallbackList, true);
        return fallbackList;
      } finally {
        this.inflightRefresh = null;
      }
    })();

    this.inflightRefresh = job;
    return job;
  }

  public async addSeriesToCache(newSeries: SonarrSeries): Promise<void> {
    const current = await this.getLeanSeriesList();
    if (current.some(series => series.id === newSeries.id)) return;

    const lean = this.toLeanSeries(newSeries);

    const updated = [...current, lean];
    this.ensureIndexes(updated, true);
    await this.cache.write(CACHE_KEY, updated, { staleMs: SOFT_TTL, hardMs: HARD_TTL });
  }

  public async removeSeriesFromCache(tvdbId: number): Promise<void> {
    const current = await this.getLeanSeriesList();
    const filtered = current.filter(series => series.tvdbId !== tvdbId);
    if (filtered.length === current.length) return;

    this.ensureIndexes(filtered, true);
    await this.cache.write(CACHE_KEY, filtered, { staleMs: SOFT_TTL, hardMs: HARD_TTL });
  }

  public async getSeriesStatus(
    payload: CheckSeriesStatusPayload,
    options: { force_verify?: boolean; network?: 'never'; ignoreFailureCache?: boolean; priority?: RequestPriority } = {},
  ): Promise<CheckSeriesStatusResponse> {
    if (import.meta.env.DEV) {
      const pr = options.priority ?? 'normal';
      const net = options.network ?? 'allow';
      console.debug(`[ani2arr | LibraryService] status:start anilistId=${payload.anilistId} priority=${pr} network=${net} force_verify=${String(options.force_verify === true)}`);
    }
    const leanList = await this.getLeanSeriesList();
    const sonarrOpts = await getExtensionOptionsSnapshot();
    const isConfigured = !!(sonarrOpts?.sonarrUrl && sonarrOpts?.sonarrApiKey);

    const normalizedTitle = payload.title?.trim();
    let tvdbId = this.findTvdbIdInIndex(payload);
    let successfulSynonym: string | undefined;
    if (tvdbId === null) {
      // If caller requests a high-priority check, bump AniList media priority immediately.
      if (options.priority === 'high') {
        try {
          const anyMapping = this.mappingService as unknown as { prioritizeAniListMedia?: (id: number, opts?: { schedule?: boolean }) => void };
          if (anyMapping && typeof anyMapping.prioritizeAniListMedia === 'function') {
            // Only bump priority tokens; do not schedule a network fetch here.
            // Let downstream cache-aware calls decide whether a request is needed.
            anyMapping.prioritizeAniListMedia(payload.anilistId, { schedule: false });
          }
        } catch {
          // best-effort bump; ignore failures
        }
      }
      const mappingOptions: Parameters<MappingService['resolveTvdbId']>[1] = {};
      if (!isConfigured || options.network === 'never') {
        mappingOptions.network = 'never';
      }
      if (options.ignoreFailureCache) {
        mappingOptions.ignoreFailureCache = true;
        // When user explicitly retries from the overlay, bypass Sonarr lookup caches as well.
        mappingOptions.forceLookupNetwork = true;
      }
      if (options.priority) {
        mappingOptions.priority = options.priority;
      }
      // On anime detail pages we pass force_verify=true. In that case, force Sonarr
      // lookups to bypass fresh caches so we always evaluate with current data.
      if (options.force_verify) {
        mappingOptions.forceLookupNetwork = true;
      }

      const hints: NonNullable<Parameters<MappingService['resolveTvdbId']>[1]>['hints'] = {};
      if (normalizedTitle) {
        hints.primaryTitle = normalizedTitle;
      }
      if (payload.metadata) {
        hints.domMedia = payload.metadata;
      }
      if (Object.keys(hints).length > 0) {
        mappingOptions.hints = hints;
      }

      try {
        if (import.meta.env.DEV) {
          console.debug(
            `[ani2arr | LibraryService] status:lookup-start anilistId=${payload.anilistId} priority=${options.priority ?? 'normal'} network=${options.network ?? 'allow'} ignoreFailureCache=${String(options.ignoreFailureCache === true)}`,
          );
        }
        const mapping = await this.mappingService.resolveTvdbId(payload.anilistId, mappingOptions);
        if (mapping) {
          tvdbId = mapping.tvdbId;
          successfulSynonym = mapping.successfulSynonym;
        }
        // mapping is null = not found (expected)
      } catch (error) {
        const normalized = normalizeError(error);
        // Only CONFIGURATION_ERROR is treated as graceful (not configured yet)
        if (normalized.code === ErrorCode.CONFIGURATION_ERROR) {
          return {
            exists: false,
            tvdbId: null,
            anilistTvdbLinkMissing: true,
          };
        }

        logError(normalized, `LibraryService:getSeriesStatus:${payload.anilistId}`);
        throw normalized;
      }
    }

    if (tvdbId === null) {
      if (import.meta.env.DEV) {
        console.debug(`[ani2arr | LibraryService] status:result anilistId=${payload.anilistId} outcome=unresolved`);
      }
      return { exists: false, tvdbId: null, anilistTvdbLinkMissing: true };
    }

    const cachedSeries = leanList.find(series => series.tvdbId === tvdbId) ?? null;
    const existsInCache = cachedSeries !== null;

    if (!isConfigured || !options.force_verify) {
      const out = {
        exists: existsInCache,
        tvdbId,
        ...(cachedSeries ? { series: cachedSeries } : {}),
        ...(successfulSynonym ? { successfulSynonym } : {}),
      } as CheckSeriesStatusResponse;
      if (import.meta.env.DEV) {
        console.debug(
          `[ani2arr | LibraryService] status:result anilistId=${payload.anilistId} outcome=cached exists=${String(existsInCache)} tvdbId=${tvdbId}`,
        );
      }
      return out;
    }

    const credentials = { url: sonarrOpts!.sonarrUrl!, apiKey: sonarrOpts!.sonarrApiKey! };
    const liveSeries = await this.sonarrClient.getSeriesByTvdbId(tvdbId, credentials);

    if (liveSeries) {
      let cacheMutated = false;
      if (!existsInCache) {
        await this.addSeriesToCache(liveSeries);
        cacheMutated = true;
      }

      const finalSeries = existsInCache ? cachedSeries! : this.toLeanSeries(liveSeries);

      if (cacheMutated) {
        await this.notifyLibraryMutation({ tvdbId, action: 'added' });
      }

      const out2 = {
        exists: true,
        tvdbId,
        series: finalSeries,
        ...(successfulSynonym ? { successfulSynonym } : {}),
      } as CheckSeriesStatusResponse;
      if (import.meta.env.DEV) {
        console.debug(
          `[ani2arr | LibraryService] status:result anilistId=${payload.anilistId} outcome=live exists=true tvdbId=${tvdbId}`,
        );
      }
      return out2;
    }

    if (existsInCache) {
      await this.removeSeriesFromCache(tvdbId);
      await this.notifyLibraryMutation({ tvdbId, action: 'removed' });
    }

    const out3 = {
      exists: false,
      tvdbId,
      ...(successfulSynonym ? { successfulSynonym } : {}),
    } as CheckSeriesStatusResponse;
    if (import.meta.env.DEV) {
      console.debug(
        `[ani2arr | LibraryService] status:result anilistId=${payload.anilistId} outcome=removed exists=false tvdbId=${tvdbId}`,
      );
    }
    return out3;
  }

  private toLeanSeries(series: SonarrSeries): LeanSonarrSeries {
    const alternateTitles = Array.isArray(series.alternateTitles)
      ? series.alternateTitles
          .map(item => item?.title?.trim())
          .filter((title): title is string => !!title)
      : [];

    return {
      tvdbId: series.tvdbId,
      id: series.id,
      titleSlug: series.titleSlug,
      title: series.title,
      ...(alternateTitles.length > 0 ? { alternateTitles } : {}),
    };
  }

  private ensureIndexes(list: LeanSonarrSeries[], reset = false): void {
    if (reset) {
      this.resetIndexes();
      for (const series of list) {
        this.indexSeries(series);
      }
      return;
    }

    if (
      this.tvdbSet.size === 0 &&
      this.normalizedTitleIndex.size === 0 &&
      this.leanSeriesByTvdbId.size === 0 &&
      list.length > 0
    ) {
      this.ensureIndexes(list, true);
    }
  }

  private indexSeries(series: LeanSonarrSeries): void {
    this.tvdbSet.add(series.tvdbId);
    this.leanSeriesByTvdbId.set(series.tvdbId, series);
    const normalizedKeys = this.buildNormalizedKeysForSeries(series);
    for (const key of normalizedKeys) {
      const existing = this.normalizedTitleIndex.get(key);
      if (existing === undefined) {
        // First time seeing this key
        this.normalizedTitleIndex.set(key, series.tvdbId);
      } else if (existing !== series.tvdbId) {
        // Collision detected — mark ambiguous and track all candidates
        this.normalizedTitleIndex.set(key, null);
      }
    }
  }

  private buildNormalizedKeysForSeries(series: LeanSonarrSeries): string[] {
    const rawValues = new Set<string>();
    rawValues.add(series.title);
    rawValues.add(series.titleSlug);
    const slugSpaced = series.titleSlug.replace(/[-_.]+/g, ' ');
    if (slugSpaced !== series.titleSlug) {
      rawValues.add(slugSpaced);
    }

    if (Array.isArray(series.alternateTitles)) {
      for (const title of series.alternateTitles) {
        if (title) {
          rawValues.add(title);
        }
      }
    }

    return this.normalizeTitleCandidates(rawValues);
  }

  private normalizeTitleCandidates(values: Iterable<string | null | undefined>): string[] {
    const normalized = new Set<string>();
    for (const value of values) {
      if (!value) continue;
      const trimmed = value.trim();
      if (!trimmed) continue;

      const primary = canonicalizeLookupTerm(trimmed);
      if (primary) {
        normalized.add(primary);
      }

      const sanitized = sanitizeLookupDisplay(trimmed);
      if (sanitized && sanitized !== trimmed) {
        const sanitizedCanonical = canonicalizeLookupTerm(sanitized);
        if (sanitizedCanonical) {
          normalized.add(sanitizedCanonical);
        }
      }

      const stripped = stripParenContent(trimmed);
      if (stripped && stripped !== trimmed) {
        const strippedCanonical = canonicalizeLookupTerm(stripped);
        if (strippedCanonical) {
          normalized.add(strippedCanonical);
        }
      }
    }

    return Array.from(normalized);
  }

  private findTvdbIdInIndex(payload: CheckSeriesStatusPayload): number | null {
    const candidateInputs = new Set<string>();
    if (payload.title) {
      candidateInputs.add(payload.title);
    }

    const metadata = payload.metadata;
    const mediaTitles = metadata?.titles;
    if (mediaTitles) {
      const { romaji, english, native } = mediaTitles;
      if (romaji) candidateInputs.add(romaji);
      if (english) candidateInputs.add(english);
      if (native) candidateInputs.add(native);
    }

    if (Array.isArray(metadata?.synonyms)) {
      for (const synonym of metadata.synonyms) {
        if (synonym) {
          candidateInputs.add(synonym);
        }
      }
    }

    const targetYear = metadata?.startYear ?? undefined;
    let sawAmbiguous = false;
    let bestMatch: { tvdbId: number; score: number } | null = null;

    const scoreAgainstSeries = (rawTitle: string, series: LeanSonarrSeries): number => {
      const sanitizedQuery = sanitizeLookupDisplay(rawTitle);
      const libraryTitles = new Set<string>();
      libraryTitles.add(series.title);
      libraryTitles.add(series.titleSlug);
      if (Array.isArray(series.alternateTitles)) {
        for (const alt of series.alternateTitles) {
          if (alt) {
            libraryTitles.add(alt);
          }
        }
      }

      let top = 0;
      for (const candidateRaw of libraryTitles) {
        if (!candidateRaw) continue;
        const baseArgs = (yr?: number) => (yr !== undefined ? { targetYear: yr } : {} as Record<string, unknown>);
        // Score with original query
        const scoreRaw = computeTitleMatchScore({
          queryRaw: rawTitle,
          candidateRaw,
          ...baseArgs(targetYear),
        });
        if (scoreRaw > top) top = scoreRaw;
        // Score with sanitized query (season/ordinal stripped) if different
        if (sanitizedQuery && sanitizedQuery !== rawTitle) {
          const scoreSanitized = computeTitleMatchScore({
            queryRaw: sanitizedQuery,
            candidateRaw,
            ...baseArgs(targetYear),
          });
          if (scoreSanitized > top) top = scoreSanitized;
        }
      }
      return top;
    };

    for (const rawTitle of candidateInputs) {
      if (!rawTitle) continue;
      const normalizedVariants = this.normalizeTitleCandidates([rawTitle]);
      if (normalizedVariants.length === 0) continue;

      for (const key of normalizedVariants) {
        const match = this.normalizedTitleIndex.get(key);
        if (typeof match === 'number' && this.tvdbSet.has(match)) {
          const series = this.leanSeriesByTvdbId.get(match);
          if (!series) continue;
          const score = scoreAgainstSeries(rawTitle, series);
          if (score >= LOCAL_INDEX_ACCEPTANCE_THRESHOLD) {
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = { tvdbId: match, score };
            }
          }
        } else if (match === null) {
          sawAmbiguous = true;
        }
      }
    }

    if (bestMatch) {
      incrementCounter('library.index.hit');
      return bestMatch.tvdbId;
    }

    if (sawAmbiguous) {
      incrementCounter('library.index.ambiguous');
    } else {
      incrementCounter('library.index.miss');
    }

    return null;
  }

  private resetIndexes(): void {
    this.tvdbSet.clear();
    this.normalizedTitleIndex.clear();
    this.leanSeriesByTvdbId.clear();
  }
}
