// src/services/library.service.ts
import type { SonarrApiService } from '@/api/sonarr.api';
import type { MappingService } from './mapping.service';
import type {
  CheckSeriesStatusPayload,
  CheckSeriesStatusResponse,
  SonarrSeries,
  LeanSonarrSeries,
  ExtensionOptions,
} from '../types';
import { logError, normalizeError } from '@/utils/error-handling';
import { extensionOptions } from '@/utils/storage';
import { createCache } from '@/cache';
import { idbAdapter } from '@/cache/adapters/idb';

const SONARR_KEY = 'sonarr_series_list_v2';
const SONARR_STALE = 60 * 60 * 1000;      // 1h soft TTL
const SONARR_HARD = 24 * 60 * 60 * 1000;  // 24h hard TTL
const SONARR_ERR  = 5 * 60 * 1000;        // 5m error TTL

export class LibraryService {
  private isRefreshing = false;
  private inflightRefresh: Promise<LeanSonarrSeries[]> | null = null;
  private tvdbSet: Set<number> = new Set();

  // Persisted cache for the lean series list
  private store = createCache(idbAdapter('library'), {
    namespace: 'lib:list',
    softTtlMs: SONARR_STALE,
    hardTtlMs: SONARR_HARD,
    errorTtlMs: SONARR_ERR,
  });

  constructor(
    private readonly sonarrClient: SonarrApiService,
    private readonly mappingService: MappingService,
  ) {}

  public async getLeanSeriesList(): Promise<LeanSonarrSeries[]> {
    const now = Date.now();
    const meta = await this.store.get<LeanSonarrSeries[]>(SONARR_KEY);

    if (meta && !this.store.isExpired(meta, now)) {
      if (this.tvdbSet.size === 0 && Array.isArray(meta.value)) {
        this.tvdbSet = new Set(meta.value.map(s => s.tvdbId));
      }
      if (this.store.isStale(meta, now) && !this.isRefreshing) {
        this.isRefreshing = true;
        this.refreshCache().finally(() => {
          this.isRefreshing = false;
        });
      }
      return meta.value;
    }

    return this.refreshCache();
  }

  public async refreshCache(optionsOverride?: ExtensionOptions): Promise<LeanSonarrSeries[]> {
    if (this.inflightRefresh) return this.inflightRefresh;

    const p = (async () => {
      try {
        const options = optionsOverride ?? await extensionOptions.getValue();
        if (!options?.sonarrUrl || !options?.sonarrApiKey) {
          this.tvdbSet.clear();
          await this.store.set(SONARR_KEY, [], Date.now());
          return [];
        }
        const credentials = { url: options.sonarrUrl, apiKey: options.sonarrApiKey };
        const fullSeriesList = await this.sonarrClient.getAllSeries(credentials);
        const leanSeriesList = fullSeriesList.map((s: SonarrSeries) => ({
          tvdbId: s.tvdbId,
          id: s.id,
          titleSlug: s.titleSlug,
        })) satisfies LeanSonarrSeries[];

        this.tvdbSet = new Set(leanSeriesList.map(s => s.tvdbId));
        await this.store.set(SONARR_KEY, leanSeriesList, Date.now());
        return leanSeriesList;
      } catch (e) {
        logError(normalizeError(e), 'LibraryService:refreshCache');
        const cached = (await this.store.get<LeanSonarrSeries[]>(SONARR_KEY))?.value ?? [];
        this.tvdbSet = new Set(cached.map(s => s.tvdbId));
        return cached;
      } finally {
        this.inflightRefresh = null;
      }
    })();

    this.inflightRefresh = p;
    return p;
  }

  public async addSeriesToCache(newSeries: SonarrSeries): Promise<void> {
    try {
      const currentList = await this.getLeanSeriesList();
      if (!currentList.some(s => s.id === newSeries.id)) {
        const lean: LeanSonarrSeries = {
          tvdbId: newSeries.tvdbId,
          id: newSeries.id,
          titleSlug: newSeries.titleSlug,
        };
        const updatedList = [...currentList, lean];
        this.tvdbSet.add(newSeries.tvdbId);
        await this.store.set(SONARR_KEY, updatedList, Date.now());
      }
    } catch (e) {
      logError(normalizeError(e), 'LibraryService:addSeriesToCache');
    }
  }

  public async getSeriesStatus(
    payload: CheckSeriesStatusPayload,
    options: { force_verify?: boolean; network?: 'never'; ignoreFailureCache?: boolean } = {},
  ): Promise<CheckSeriesStatusResponse> {
    try {
      const leanSeriesList = await this.getLeanSeriesList();

      // Read Sonarr options once
      const sonarrOpts = await extensionOptions.getValue();
      const hasSonarr = !!sonarrOpts?.sonarrUrl && !!sonarrOpts?.sonarrApiKey;

      const mappingOptions: { network?: 'never'; hints?: { primaryTitle?: string }; ignoreFailureCache?: boolean } = {};
      if (!hasSonarr || options.network === 'never') {
        mappingOptions.network = 'never';
      }
      if (options.ignoreFailureCache) {
        mappingOptions.ignoreFailureCache = true;
      }
      const normalizedTitle = payload.title?.trim();
      if (normalizedTitle) {
        mappingOptions.hints = { primaryTitle: normalizedTitle };
      }

      // Resolve mapping
      let tvdbId: number | null = null;
      let successfulSynonym: string | undefined;
      try {
        const res = await this.mappingService.resolveTvdbId(payload.anilistId, mappingOptions);
        tvdbId = res.tvdbId ?? null;
        successfulSynonym = res.successfulSynonym;
      } catch (e) {
        const err = normalizeError(e);
        if (err.code === 'CONFIGURATION_ERROR' || err.code === 'VALIDATION_ERROR') {
          tvdbId = null;
        } else {
          logError(err, `LibraryService:getSeriesStatus:${payload.anilistId}`);
          throw err;
        }
      }

      if (tvdbId === null) {
        return { exists: false, tvdbId: null, ...(successfulSynonym && { successfulSynonym }) };
      }

      const seriesFromCache = leanSeriesList.find(s => s.tvdbId === tvdbId);
      const existsInCache = !!seriesFromCache;

      // If Sonarr isn't configured, or we don't need forced verification, return cache view
      if (!hasSonarr || !options.force_verify) {
        return {
          exists: existsInCache,
          tvdbId,
          ...(seriesFromCache && { series: seriesFromCache }),
          ...(successfulSynonym && { successfulSynonym }),
        };
      }

      // Live verify
      const credentials = { url: sonarrOpts!.sonarrUrl!, apiKey: sonarrOpts!.sonarrApiKey! };
      const seriesFromApi = await this.sonarrClient.getSeriesByTvdbId(tvdbId, credentials);

      if (seriesFromApi) {
        if (!existsInCache) await this.addSeriesToCache(seriesFromApi);
        const finalSeries =
          leanSeriesList.find(s => s.tvdbId === tvdbId) ?? {
            tvdbId: seriesFromApi.tvdbId,
            id: seriesFromApi.id,
            titleSlug: seriesFromApi.titleSlug,
          };
        return {
          exists: true,
          tvdbId,
          series: finalSeries,
          ...(successfulSynonym && { successfulSynonym }),
        };
      } else {
        if (existsInCache) await this.removeFromCache(tvdbId, leanSeriesList);
        return {
          exists: false,
          tvdbId,
          ...(successfulSynonym && { successfulSynonym }),
        };
      }
    } catch (e) {
      const normalized = normalizeError(e);
      logError(normalized, `LibraryService:getSeriesStatus:${payload.anilistId}`);
      throw normalized;
    }
  }

  private async removeFromCache(tvdbId: number, list: LeanSonarrSeries[]): Promise<LeanSonarrSeries[]> {
    try {
      const updatedList = list.filter(s => s.tvdbId !== tvdbId);
      this.tvdbSet.delete(tvdbId);
      await this.store.set(SONARR_KEY, updatedList, Date.now());
      return updatedList;
    } catch (e) {
      logError(normalizeError(e), 'LibraryService:removeFromCache');
      return list;
    }
  }
}
