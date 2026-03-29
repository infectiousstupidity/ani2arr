// src/services/library/sonarr/store.ts
import type { LibraryCaches, SonarrClient, SonarrSeries, ExtensionOptions, TitleIndexer, SonarrSeriesSnapshot } from './types';
import { getExtensionOptionsSnapshot, STORAGE_POLICIES } from '@/storage';
import { logError, normalizeError } from '@/shared/errors';
import { CACHE_KEY } from './constants';

export class SonarrLibraryStore {
  private inflightRefresh: Promise<SonarrSeriesSnapshot[]> | null = null;
  private idxInit = false;

  constructor(
    private readonly sonarrClient: SonarrClient,
    private readonly caches: LibraryCaches,
    private readonly indexer: TitleIndexer
  ) {}

  async getLeanSeriesList(): Promise<SonarrSeriesSnapshot[]> {
    const cached = await this.caches.lean.read(CACHE_KEY);
    if (cached) {
      this.ensureIndexes(cached.value);
      if (cached.stale && !this.inflightRefresh) {
        this.refreshCache().catch(err => logError(normalizeError(err), 'SonarrLibraryStore:backgroundRefresh'));
      }
      return cached.value;
    }
    return this.refreshCache();
  }

  async refreshCache(optionsOverride?: ExtensionOptions): Promise<SonarrSeriesSnapshot[]> {
    if (this.inflightRefresh) return this.inflightRefresh;

    const job = (async () => {
      const cached = await this.caches.lean.read(CACHE_KEY);
      const fallbackList = cached?.value ?? [];

      try {
        const options = optionsOverride ?? (await getExtensionOptionsSnapshot());
        if (!options?.providers.sonarr.url || !options?.providers.sonarr.apiKey) {
          this.indexer.reset();
          await this.caches.lean.remove(CACHE_KEY);
          return [];
        }

        const credentials = { url: options.providers.sonarr.url, apiKey: options.providers.sonarr.apiKey };
        const full = await this.sonarrClient.getAllSeries(credentials);
        const snapshots: SonarrSeriesSnapshot[] = full
          .filter(s => typeof s.tvdbId === 'number' && Number.isFinite(s.tvdbId))
          .map(s => this.toSeriesSnapshot(s));

        this.indexer.reindex(snapshots);
        await this.caches.lean.write(CACHE_KEY, snapshots, {
          staleMs: STORAGE_POLICIES.providerLibrary.staleMs,
          hardMs: STORAGE_POLICIES.providerLibrary.hardMs,
        });
        return snapshots;
      } catch (error) {
        const normalized = normalizeError(error);
        logError(normalized, 'SonarrLibraryStore:refreshCache');

        await this.caches.lean.write(CACHE_KEY, fallbackList, {
          staleMs: STORAGE_POLICIES.providerLibrary.errorStaleMs,
          hardMs: STORAGE_POLICIES.providerLibrary.errorHardMs,
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
    const snapshot = this.toSeriesSnapshot(newSeries);
    const idx = current.findIndex(s => s.id === newSeries.id);
    const updated =
      idx >= 0 ? [...current.slice(0, idx), snapshot, ...current.slice(idx + 1)] : [...current, snapshot];

    this.indexer.reindex(updated);
    await this.caches.lean.write(CACHE_KEY, updated, { 
      staleMs: STORAGE_POLICIES.providerLibrary.staleMs,
      hardMs: STORAGE_POLICIES.providerLibrary.hardMs
    });
  }

  async removeSeriesFromCache(tvdbId: number): Promise<void> {
    const current = await this.getLeanSeriesList();
    const filtered = current.filter(s => s.tvdbId !== tvdbId);
    if (filtered.length === current.length) return;

    this.indexer.reindex(filtered);
    await this.caches.lean.write(CACHE_KEY, filtered, { 
      staleMs: STORAGE_POLICIES.providerLibrary.staleMs,
      hardMs: STORAGE_POLICIES.providerLibrary.hardMs
    });
  }

  private ensureIndexes(list: SonarrSeriesSnapshot[]): void {
    // Rebuild only if empty and we have data
    if (list.length === 0) return;
    if (this.idxInit === true) return;
    this.indexer.reindex(list);
    this.idxInit = true;
  }

  private toSeriesSnapshot(series: SonarrSeries): SonarrSeriesSnapshot {
    const alternateTitles = Array.isArray(series.alternateTitles)
      ? series.alternateTitles.map(t => t?.title?.trim()).filter((t): t is string => !!t)
      : [];

    const statistics = series.statistics
      ? {
          ...(typeof series.statistics.episodeCount === 'number'
            ? { episodeCount: series.statistics.episodeCount }
            : {}),
          ...(typeof series.statistics.episodeFileCount === 'number'
            ? { episodeFileCount: series.statistics.episodeFileCount }
            : {}),
          ...(typeof series.statistics.totalEpisodeCount === 'number'
            ? { totalEpisodeCount: series.statistics.totalEpisodeCount }
            : {}),
        }
      : undefined;

    return {
      tvdbId: series.tvdbId,
      id: series.id,
      titleSlug: series.titleSlug,
      title: series.title,
      ...(alternateTitles.length > 0 ? { alternateTitles } : {}),
      ...(statistics ? { statistics } : {}),
    };
  }
}
