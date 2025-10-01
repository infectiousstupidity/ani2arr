// src/services/library.service.ts
import type { TtlCache } from '@/cache';
import type { SonarrApiService } from '@/api/sonarr.api';
import type { MappingService } from './mapping.service';
import type {
  CheckSeriesStatusPayload,
  CheckSeriesStatusResponse,
  ExtensionOptions,
  LeanSonarrSeries,
  SonarrSeries,
} from '@/types';
import { ErrorCode, logError, normalizeError } from '@/utils/error-handling';
import { extensionOptions } from '@/utils/storage';

const CACHE_KEY = 'sonarr:lean-series';
const SOFT_TTL = 60 * 60 * 1000; // 1h
const HARD_TTL = 24 * 60 * 60 * 1000; // 24h
const ERROR_TTL = 5 * 60 * 1000; // 5m
type LibraryMutationPayload = {
  tvdbId: number;
  action: 'added' | 'removed';
};

export class LibraryService {
  private inflightRefresh: Promise<LeanSonarrSeries[]> | null = null;
  private tvdbSet: Set<number> = new Set();

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
      this.ensureTvdbIndex(cached.value);
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
        const options = optionsOverride ?? (await extensionOptions.getValue());
        if (!options?.sonarrUrl || !options?.sonarrApiKey) {
          this.resetTvdbIndex();
          await this.cache.write(CACHE_KEY, [], { staleMs: SOFT_TTL, hardMs: HARD_TTL });
          return [];
        }

        const credentials = { url: options.sonarrUrl, apiKey: options.sonarrApiKey };
        const fullSeriesList = await this.sonarrClient.getAllSeries(credentials);
        const leanList: LeanSonarrSeries[] = fullSeriesList
          .filter(series => typeof series.tvdbId === 'number' && Number.isFinite(series.tvdbId))
          .map(series => ({
            tvdbId: series.tvdbId,
            id: series.id,
            titleSlug: series.titleSlug,
          }));

        this.ensureTvdbIndex(leanList, true);
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

        this.ensureTvdbIndex(fallbackList);
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

    const lean: LeanSonarrSeries = {
      tvdbId: newSeries.tvdbId,
      id: newSeries.id,
      titleSlug: newSeries.titleSlug,
    };

    const updated = [...current, lean];
    this.ensureTvdbIndex(updated, true);
    await this.cache.write(CACHE_KEY, updated, { staleMs: SOFT_TTL, hardMs: HARD_TTL });
  }

  public async removeSeriesFromCache(tvdbId: number): Promise<void> {
    const current = await this.getLeanSeriesList();
    const filtered = current.filter(series => series.tvdbId !== tvdbId);
    if (filtered.length === current.length) return;

    this.ensureTvdbIndex(filtered, true);
    await this.cache.write(CACHE_KEY, filtered, { staleMs: SOFT_TTL, hardMs: HARD_TTL });
  }

  public async getSeriesStatus(
    payload: CheckSeriesStatusPayload,
    options: { force_verify?: boolean; network?: 'never'; ignoreFailureCache?: boolean } = {},
  ): Promise<CheckSeriesStatusResponse> {
    const leanList = await this.getLeanSeriesList();
    const sonarrOpts = await extensionOptions.getValue();
    const isConfigured = !!(sonarrOpts?.sonarrUrl && sonarrOpts?.sonarrApiKey);

    const mappingOptions: Parameters<MappingService['resolveTvdbId']>[1] = {};
    if (!isConfigured || options.network === 'never') {
      mappingOptions.network = 'never';
    }
    if (options.ignoreFailureCache) {
      mappingOptions.ignoreFailureCache = true;
    }
    const normalizedTitle = payload.title?.trim();
    if (normalizedTitle) {
      mappingOptions.hints = { primaryTitle: normalizedTitle };
    }

    let tvdbId: number | null = null;
    let successfulSynonym: string | undefined;
    try {
      const mapping = await this.mappingService.resolveTvdbId(payload.anilistId, mappingOptions);
      tvdbId = mapping.tvdbId ?? null;
      successfulSynonym = mapping.successfulSynonym;
    } catch (error) {
      const normalized = normalizeError(error);
      if (normalized.code === ErrorCode.CONFIGURATION_ERROR || normalized.code === ErrorCode.VALIDATION_ERROR) {
        return {
          exists: false,
          tvdbId: null,
          anilistTvdbLinkMissing: true,
        };
      }

      logError(normalized, `LibraryService:getSeriesStatus:${payload.anilistId}`);
      throw normalized;
    }

    if (tvdbId === null) {
      return { exists: false, tvdbId: null, anilistTvdbLinkMissing: true };
    }

    const cachedSeries = leanList.find(series => series.tvdbId === tvdbId) ?? null;
    const existsInCache = cachedSeries !== null;

    if (!isConfigured || !options.force_verify) {
      return {
        exists: existsInCache,
        tvdbId,
        ...(cachedSeries ? { series: cachedSeries } : {}),
        ...(successfulSynonym ? { successfulSynonym } : {}),
      };
    }

    const credentials = { url: sonarrOpts!.sonarrUrl!, apiKey: sonarrOpts!.sonarrApiKey! };
    const liveSeries = await this.sonarrClient.getSeriesByTvdbId(tvdbId, credentials);

    if (liveSeries) {
      let cacheMutated = false;
      if (!existsInCache) {
        await this.addSeriesToCache(liveSeries);
        cacheMutated = true;
      }

      const finalSeries = existsInCache
        ? cachedSeries!
        : {
            tvdbId: liveSeries.tvdbId,
            id: liveSeries.id,
            titleSlug: liveSeries.titleSlug,
          };

      if (cacheMutated) {
        await this.notifyLibraryMutation({ tvdbId, action: 'added' });
      }

      return {
        exists: true,
        tvdbId,
        series: finalSeries,
        ...(successfulSynonym ? { successfulSynonym } : {}),
      };
    }

    if (existsInCache) {
      await this.removeSeriesFromCache(tvdbId);
      await this.notifyLibraryMutation({ tvdbId, action: 'removed' });
    }

    return {
      exists: false,
      tvdbId,
      ...(successfulSynonym ? { successfulSynonym } : {}),
    };
  }

  private ensureTvdbIndex(list: LeanSonarrSeries[], reset = false): void {
    if (reset) {
      this.tvdbSet = new Set(list.map(series => series.tvdbId));
      return;
    }

    if (this.tvdbSet.size === 0 && list.length > 0) {
      this.tvdbSet = new Set(list.map(series => series.tvdbId));
    }
  }

  private resetTvdbIndex(): void {
    this.tvdbSet.clear();
  }
}
