import type { CacheService } from './cache.service';
import type { SonarrApiService } from '@/api/sonarr.api';
import type { MappingService } from './mapping.service';
import type { CheckSeriesStatusPayload, CheckSeriesStatusResponse, SonarrSeries, LeanSonarrSeries } from '../types';
import { logError, normalizeError } from '@/utils/error-handling';
import { extensionOptions } from '@/utils/storage';

const SONARR_KEY = 'sonarr_series_list_v2';
const SONARR_STALE = 60 * 60 * 1000;
const SONARR_HARD = 24 * 60 * 60 * 1000;

export class LibraryService {
  private isRefreshing = false;
  private inflightRefresh: Promise<LeanSonarrSeries[]> | null = null;
  private tvdbSet: Set<number> = new Set();

  constructor(
    private readonly sonarrClient: SonarrApiService,
    private readonly mappingService: MappingService,
    private readonly cacheService: CacheService,
  ) {}

  public async getLeanSeriesList(): Promise<LeanSonarrSeries[]> {
    const meta = await this.cacheService.getWithMeta<LeanSonarrSeries[]>(SONARR_KEY);

    if (meta?.v) {
      if (Date.now() >= meta.staleAt && !this.isRefreshing) {
        this.isRefreshing = true;
        this.refreshCache().finally(() => {
          this.isRefreshing = false;
        });
      }
      if (this.tvdbSet.size === 0 && Array.isArray(meta.v)) {
        this.tvdbSet = new Set(meta.v.map(s => s.tvdbId));
      }
      return meta.v;
    }

    return this.refreshCache();
  }

  public async refreshCache(): Promise<LeanSonarrSeries[]> {
    if (this.inflightRefresh) return this.inflightRefresh;

    const p = (async () => {
      try {
        const options = await extensionOptions.getValue();
        if (!options?.sonarrUrl || !options?.sonarrApiKey) {
          this.tvdbSet.clear();
          await this.cacheService.set(SONARR_KEY, [], SONARR_STALE, SONARR_HARD);
          return [];
        }
        const credentials = { url: options.sonarrUrl, apiKey: options.sonarrApiKey };
        const fullSeriesList = await this.sonarrClient.getAllSeries(credentials);
        const leanSeriesList = fullSeriesList.map((s: SonarrSeries) => ({
          tvdbId: s.tvdbId,
          id: s.id,
          titleSlug: s.titleSlug,
        }));

        this.tvdbSet = new Set(leanSeriesList.map(s => s.tvdbId));
        await this.cacheService.set(SONARR_KEY, leanSeriesList, SONARR_STALE, SONARR_HARD);
        return leanSeriesList;
      } catch (e) {
        logError(normalizeError(e), 'LibraryService:refreshCache');
        const cached = (await this.cacheService.get<LeanSonarrSeries[]>(SONARR_KEY)) ?? [];
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
        await this.cacheService.set(SONARR_KEY, updatedList, SONARR_STALE, SONARR_HARD);
      }
    } catch (e) {
      logError(normalizeError(e), 'LibraryService:addSeriesToCache');
    }
  }

  public async getSeriesStatus(
    payload: CheckSeriesStatusPayload,
    options: { force_verify?: boolean; network?: 'never' } = {},
  ): Promise<CheckSeriesStatusResponse> {
    try {
      const leanSeriesList = await this.getLeanSeriesList();

      const mappingOptions: { network?: 'never'; hints?: { primaryTitle?: string } } = {};
      if (options.network === 'never') {
        mappingOptions.network = 'never';
      }
      const normalizedTitle = payload.title?.trim();
      if (normalizedTitle) {
        mappingOptions.hints = { primaryTitle: normalizedTitle };
      }

      const { tvdbId, successfulSynonym } =
        await this.mappingService.resolveTvdbId(payload.anilistId, mappingOptions);

      // MappingService never returns null tvdbId; keeping check defensively
      if (tvdbId === null) {
        return { exists: false, tvdbId: null, ...(successfulSynonym && { successfulSynonym }) };
      }

      const seriesFromCache = leanSeriesList.find(s => s.tvdbId === tvdbId);
      const existsInCache = !!seriesFromCache;

      if (!options.force_verify) {
        return {
          exists: existsInCache,
          tvdbId,
          ...(seriesFromCache && { series: seriesFromCache }),
          ...(successfulSynonym && { successfulSynonym }),
        };
      }

      const sonarrOpts = await extensionOptions.getValue();
      if (!sonarrOpts?.sonarrUrl || !sonarrOpts?.sonarrApiKey) {
        return {
          exists: existsInCache,
          tvdbId,
          ...(seriesFromCache && { series: seriesFromCache }),
          ...(successfulSynonym && { successfulSynonym }),
        };
      }

      const credentials = { url: sonarrOpts.sonarrUrl, apiKey: sonarrOpts.sonarrApiKey };
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
      await this.cacheService.set(SONARR_KEY, updatedList, SONARR_STALE, SONARR_HARD);
      return updatedList;
    } catch (e) {
      logError(normalizeError(e), 'LibraryService:removeFromCache');
      return list;
    }
  }
}
