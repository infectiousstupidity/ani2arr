// src
import type { LibraryCaches, LeanSonarrSeries, SonarrClient, SonarrSeries, ExtensionOptions, TitleIndexer } from './types';
import { getExtensionOptionsSnapshot } from '@/shared/utils/storage';
import { logError, normalizeError } from '@/shared/utils/error-handling';
import { CACHE_KEY, SOFT_TTL_MS, HARD_TTL_MS, ERROR_TTL_MS } from './constants';

export class SonarrLibraryStore {
  private inflightRefresh: Promise<LeanSonarrSeries[]> | null = null;
  private idxInit = false;

  constructor(
    private readonly sonarrClient: SonarrClient,
    private readonly caches: LibraryCaches,
    private readonly indexer: TitleIndexer
  ) {}

  async getLeanSeriesList(): Promise<LeanSonarrSeries[]> {
    const cached = await this.caches.leanSeries.read(CACHE_KEY);
    if (cached) {
      this.ensureIndexes(cached.value);
      if (cached.stale && !this.inflightRefresh) {
        this.refreshCache().catch(err => logError(normalizeError(err), 'SonarrLibraryStore:backgroundRefresh'));
      }
      return cached.value;
    }
    return this.refreshCache();
  }

  async refreshCache(optionsOverride?: ExtensionOptions): Promise<LeanSonarrSeries[]> {
    if (this.inflightRefresh) return this.inflightRefresh;

    const job = (async () => {
      const cached = await this.caches.leanSeries.read(CACHE_KEY);
      const fallbackList = cached?.value ?? [];

      try {
        const options = optionsOverride ?? (await getExtensionOptionsSnapshot());
        if (!options?.sonarrUrl || !options?.sonarrApiKey) {
          this.indexer.reset();
          await this.caches.leanSeries.write(CACHE_KEY, [], { staleMs: SOFT_TTL_MS, hardMs: HARD_TTL_MS });
          return [];
        }

        const credentials = { url: options.sonarrUrl, apiKey: options.sonarrApiKey };
        const full = await this.sonarrClient.getAllSeries(credentials);
        const lean: LeanSonarrSeries[] = full
          .filter(s => typeof s.tvdbId === 'number' && Number.isFinite(s.tvdbId))
          .map(s => this.toLeanSeries(s));

        this.indexer.reindex(lean);
        await this.caches.leanSeries.write(CACHE_KEY, lean, { staleMs: SOFT_TTL_MS, hardMs: HARD_TTL_MS });
        return lean;
      } catch (error) {
        const normalized = normalizeError(error);
        logError(normalized, 'SonarrLibraryStore:refreshCache');

        await this.caches.leanSeries.write(CACHE_KEY, fallbackList, {
          staleMs: ERROR_TTL_MS,
          hardMs: ERROR_TTL_MS * 2,
          meta: { lastErrorCode: normalized.code },
        });

        this.indexer.reindex(fallbackList);
        return fallbackList;
      } finally {
        this.inflightRefresh = null;
      }
    })();

    this.inflightRefresh = job;
    return job;
  }

  async addSeriesToCache(newSeries: SonarrSeries): Promise<void> {
    const current = await this.getLeanSeriesList();
    if (current.some(s => s.id === newSeries.id)) return;

    const lean = this.toLeanSeries(newSeries);
    const updated = [...current, lean];
    this.indexer.reindex(updated);
    await this.caches.leanSeries.write(CACHE_KEY, updated, { staleMs: SOFT_TTL_MS, hardMs: HARD_TTL_MS });
  }

  async removeSeriesFromCache(tvdbId: number): Promise<void> {
    const current = await this.getLeanSeriesList();
    const filtered = current.filter(s => s.tvdbId !== tvdbId);
    if (filtered.length === current.length) return;

    this.indexer.reindex(filtered);
    await this.caches.leanSeries.write(CACHE_KEY, filtered, { staleMs: SOFT_TTL_MS, hardMs: HARD_TTL_MS });
  }

  private ensureIndexes(list: LeanSonarrSeries[]): void {
    // Rebuild only if empty and we have data
    if (list.length === 0) return;
    if (this.idxInit === true) return;
    this.indexer.reindex(list);
    this.idxInit = true;
  }

  private toLeanSeries(series: SonarrSeries): LeanSonarrSeries {
    const alternateTitles = Array.isArray(series.alternateTitles)
      ? series.alternateTitles.map(t => t?.title?.trim()).filter((t): t is string => !!t)
      : [];
    return {
      tvdbId: series.tvdbId,
      id: series.id,
      titleSlug: series.titleSlug,
      title: series.title,
      ...(alternateTitles.length > 0 ? { alternateTitles } : {}),
      ...(series.statistics ? { statistics: series.statistics } : {}),
    };
  }
}
