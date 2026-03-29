import type { ExtensionOptions } from '@/shared/types';
import type { RadarrMovie, RadarrMovieSnapshot } from '@/shared/types/providers';
import type { LibraryCaches, RadarrClient, TitleIndexer } from './types';
import { getExtensionOptionsSnapshot, STORAGE_POLICIES } from '@/storage';
import { logError, normalizeError } from '@/shared/errors';
import { CACHE_KEY } from './constants';

export class RadarrLibraryStore {
  private inflightRefresh: Promise<RadarrMovieSnapshot[]> | null = null;
  private idxInit = false;

  constructor(
    private readonly radarrClient: RadarrClient,
    private readonly caches: LibraryCaches,
    private readonly indexer: TitleIndexer,
  ) {}

  async getLeanMovieList(): Promise<RadarrMovieSnapshot[]> {
    const cached = await this.caches.lean.read(CACHE_KEY);
    if (cached) {
      this.ensureIndexes(cached.value);
      if (cached.stale && !this.inflightRefresh) {
        this.refreshCache().catch(err => logError(normalizeError(err), 'RadarrLibraryStore:backgroundRefresh'));
      }
      return cached.value;
    }
    return this.refreshCache();
  }

  async refreshCache(optionsOverride?: ExtensionOptions): Promise<RadarrMovieSnapshot[]> {
    if (this.inflightRefresh) return this.inflightRefresh;

    const job = (async () => {
      const cached = await this.caches.lean.read(CACHE_KEY);
      const fallbackList = cached?.value ?? [];

      try {
        const options = optionsOverride ?? (await getExtensionOptionsSnapshot());
        if (!options?.providers.radarr.url || !options?.providers.radarr.apiKey) {
          this.indexer.reset();
          await this.caches.lean.remove(CACHE_KEY);
          return [];
        }

        const credentials = { url: options.providers.radarr.url, apiKey: options.providers.radarr.apiKey };
        const full = await this.radarrClient.getAllMovies(credentials);
        const lean: RadarrMovieSnapshot[] = full
          .filter(movie => typeof movie.tmdbId === 'number' && Number.isFinite(movie.tmdbId))
          .map(movie => this.toLeanMovie(movie));

        this.indexer.reindex(lean);
        await this.caches.lean.write(CACHE_KEY, lean, { 
          staleMs: STORAGE_POLICIES.providerLibrary.staleMs,
          hardMs: STORAGE_POLICIES.providerLibrary.hardMs
        });
        return lean;
      } catch (error) {
        const normalized = normalizeError(error);
        logError(normalized, 'RadarrLibraryStore:refreshCache');

        await this.caches.lean.write(CACHE_KEY, fallbackList, {
          staleMs: STORAGE_POLICIES.providerLibrary.staleMs,
          hardMs: STORAGE_POLICIES.providerLibrary.hardMs,
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

  async addMovieToCache(newMovie: RadarrMovie): Promise<void> {
    const current = await this.getLeanMovieList();
    const lean = this.toLeanMovie(newMovie);
    const idx = current.findIndex(movie => movie.id === newMovie.id);
    const updated = idx >= 0 ? [...current.slice(0, idx), lean, ...current.slice(idx + 1)] : [...current, lean];
    this.indexer.reindex(updated);
    await this.caches.lean.write(CACHE_KEY, updated, {
      staleMs: STORAGE_POLICIES.providerLibrary.staleMs,
      hardMs: STORAGE_POLICIES.providerLibrary.hardMs
    });
  }

  async removeMovieFromCache(tmdbId: number): Promise<void> {
    const current = await this.getLeanMovieList();
    const filtered = current.filter(movie => movie.tmdbId !== tmdbId);
    if (filtered.length === current.length) return;

    this.indexer.reindex(filtered);
    await this.caches.lean.write(CACHE_KEY, filtered, { 
      staleMs: STORAGE_POLICIES.providerLibrary.staleMs, 
      hardMs: STORAGE_POLICIES.providerLibrary.hardMs 
    });
  }

  private ensureIndexes(list: RadarrMovieSnapshot[]): void {
    if (list.length === 0) return;
    if (this.idxInit === true) return;
    this.indexer.reindex(list);
    this.idxInit = true;
  }

  private toLeanMovie(movie: RadarrMovie): RadarrMovieSnapshot {
    const alternateTitles = Array.isArray(movie.alternateTitles)
      ? movie.alternateTitles.map(title => title?.title?.trim()).filter((title): title is string => !!title)
      : [];

    return {
      tmdbId: movie.tmdbId,
      id: movie.id,
      title: movie.title,
      ...(movie.titleSlug ? { titleSlug: movie.titleSlug } : {}),
      ...(movie.sortTitle ? { sortTitle: movie.sortTitle } : {}),
      ...(movie.originalTitle ? { originalTitle: movie.originalTitle } : {}),
      ...(movie.folderName ? { folderName: movie.folderName } : {}),
      ...(movie.imdbId ? { imdbId: movie.imdbId } : {}),
      ...(typeof movie.year === 'number' ? { year: movie.year } : {}),
      ...(alternateTitles.length > 0 ? { alternateTitles } : {}),
      ...(typeof movie.monitored === 'boolean' ? { monitored: movie.monitored } : {}),
      ...(movie.minimumAvailability ? { minimumAvailability: movie.minimumAvailability } : {}),
      ...(typeof movie.hasFile === 'boolean' ? { hasFile: movie.hasFile } : {}),
      ...(typeof movie.sizeOnDisk === 'number' ? { sizeOnDisk: movie.sizeOnDisk } : {}),
      ...(typeof movie.status === 'string' ? { status: movie.status } : {}),
    };
  }
}
