/**
 * Sonarr library SWR cache + debounced status checks.
 */

import type { CacheService } from './cache.service';
import type { SonarrApiService } from '@/api/sonarr.api';
import type { MappingService } from './mapping.service';
import type { CheckSeriesStatusResponse, SonarrSeries, LeanSonarrSeries } from '../types';
import { logError, normalizeError } from '@/utils/error-handling';
import { extensionOptions } from '@/utils/storage';

const SONARR_KEY = 'sonarr_series_list_v2';
const SONARR_STALE = 60 * 60 * 1000;    // 1h soft
const SONARR_HARD  = 24 * 60 * 60 * 1000; // 24h hard
const STATUS_DEBOUNCE_MS = 120;

type PendingStatusRequest = {
  options: { force_verify?: boolean };
  resolve: (v: CheckSeriesStatusResponse) => void;
  reject: (r?: unknown) => void;
};

export class LibraryService {
  private isRefreshing = false;
  private inflightRefresh: Promise<LeanSonarrSeries[]> | null = null;
  private pending = new Map<number, PendingStatusRequest>();
  private timer?: number;

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
        this.refreshCache().finally(() => { this.isRefreshing = false; });
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
        if (!options?.sonarrUrl || !options?.sonarrApiKey) return [];
        const credentials = { url: options.sonarrUrl, apiKey: options.sonarrApiKey };
        const full = await this.sonarrClient.getAllSeries(credentials);
        const lean = full.map((s: SonarrSeries) => ({ tvdbId: s.tvdbId, id: s.id, titleSlug: s.titleSlug }));
        await this.cacheService.set(SONARR_KEY, lean, SONARR_STALE, SONARR_HARD);
        return lean;
      } catch (e) {
        logError(normalizeError(e), 'LibraryService:refreshCache');
        return (await this.cacheService.get<LeanSonarrSeries[]>(SONARR_KEY)) ?? [];
      } finally {
        this.inflightRefresh = null;
      }
    })();
    this.inflightRefresh = p;
    return p;
  }

  public async addSeriesToCache(newSeries: SonarrSeries): Promise<void> {
    try {
      const meta = await this.cacheService.getWithMeta<LeanSonarrSeries[]>(SONARR_KEY);
      const current = meta?.v ?? [];
      if (!current.some(s => s.id === newSeries.id)) {
        const lean: LeanSonarrSeries = { tvdbId: newSeries.tvdbId, id: newSeries.id, titleSlug: newSeries.titleSlug };
        const updated = [...current, lean];
        await this.cacheService.set(SONARR_KEY, updated, SONARR_STALE, SONARR_HARD);
      }
    } catch (e) {
      logError(normalizeError(e), 'LibraryService:addSeriesToCache');
    }
  }

  public getSeriesStatus(anilistId: number, options: { force_verify?: boolean } = {}): Promise<CheckSeriesStatusResponse> {
    return new Promise((resolve, reject) => {
      this.pending.set(anilistId, { options, resolve, reject });
      if (this.timer) globalThis.clearTimeout(this.timer);
      this.timer = globalThis.setTimeout(this.processQueue, STATUS_DEBOUNCE_MS) as unknown as number;
    });
  }

  private processQueue = async (): Promise<void> => {
    if (this.pending.size === 0) return;
    const items = new Map(this.pending);
    this.pending.clear();

    try {
      let lean = await this.getLeanSeriesList();
      const options = await extensionOptions.getValue();
      const creds = options?.sonarrUrl && options?.sonarrApiKey ? { url: options.sonarrUrl, apiKey: options.sonarrApiKey } : null;

      for (const [anilistId, req] of items) {
        try {
          const { tvdbId, successfulSynonym } = await this.mappingService.resolveTvdbId(anilistId);
          const hit = lean.find(s => s.tvdbId === tvdbId);

          if (!hit) {
            req.resolve({ exists: false, tvdbId, successfulSynonym });
            continue;
          }

          if (!req.options.force_verify || !creds) {
            req.resolve({ exists: true, tvdbId, series: hit, successfulSynonym });
            continue;
          }

          const fresh = await this.sonarrClient.getSeriesByTvdbId(tvdbId, creds);
          if (fresh) {
            req.resolve({ exists: true, tvdbId, series: hit, successfulSynonym });
          } else {
            lean = await this.removeFromCache(tvdbId, lean);
            req.resolve({ exists: false, tvdbId, successfulSynonym });
          }
        } catch (e) {
          logError(normalizeError(e), `LibraryService:getSeriesStatus:${anilistId}`);
          req.resolve({ exists: false, tvdbId: null });
        }
      }
    } catch (e) {
      logError(normalizeError(e), 'LibraryService:processQueue:FATAL');
      items.forEach(r => r.reject(e));
    }
  };

  private async removeFromCache(tvdbId: number, list: LeanSonarrSeries[]): Promise<LeanSonarrSeries[]> {
    try {
      const updated = list.filter(s => s.tvdbId !== tvdbId);
      await this.cacheService.set(SONARR_KEY, updated, SONARR_STALE, SONARR_HARD);
      return updated;
    } catch (e) {
      logError(normalizeError(e), 'LibraryService:removeFromCache');
      return list;
    }
  }
}
