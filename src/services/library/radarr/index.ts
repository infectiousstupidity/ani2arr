import type {
  CheckMovieStatusPayload,
  CheckMovieStatusResponse,
  LibraryCaches,
  LeanRadarrMovie,
  MappingResolver,
  RadarrClient,
  RadarrLibraryMutationEmitter,
  RadarrLibraryStatusOptions,
} from './types';
import type { ExtensionOptions, RadarrMovie } from '@/shared/types';
import { RadarrTitleIndexer } from './title-indexer';
import { RadarrLibraryStore } from './store';
import { RadarrStatus } from './status';

export class RadarrLibrary {
  private readonly indexer = new RadarrTitleIndexer();
  private readonly store: RadarrLibraryStore;
  private readonly status: RadarrStatus;

  constructor(
    radarrClient: RadarrClient,
    mappingResolver: MappingResolver,
    caches: LibraryCaches,
    emitLibraryMutation?: RadarrLibraryMutationEmitter,
  ) {
    this.store = new RadarrLibraryStore(radarrClient, caches, this.indexer);
    this.status = new RadarrStatus(this.store, this.indexer, mappingResolver, radarrClient, emitLibraryMutation);
  }

  getLeanMovieList(): Promise<LeanRadarrMovie[]> {
    return this.store.getLeanMovieList();
  }

  refreshCache(optionsOverride?: ExtensionOptions): Promise<LeanRadarrMovie[]> {
    return this.store.refreshCache(optionsOverride);
  }

  addMovieToCache(newMovie: RadarrMovie): Promise<void> {
    return this.store.addMovieToCache(newMovie);
  }

  removeMovieFromCache(tmdbId: number): Promise<void> {
    return this.store.removeMovieFromCache(tmdbId);
  }

  getMovieStatus(
    payload: CheckMovieStatusPayload,
    options: RadarrLibraryStatusOptions = {},
  ): Promise<CheckMovieStatusResponse> {
    return this.status.getMovieStatus(payload, options);
  }
}
