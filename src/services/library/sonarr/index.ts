import type {
  LibraryCaches,
  MappingResolver,
  SonarrClient,
  CheckSeriesStatusPayload,
  CheckSeriesStatusResponse,
  ExtensionOptions,
  SonarrSeries,
} from './types';
import { SonarrTitleIndexer } from './title-indexer';
import { SonarrLibraryStore } from './store';
import { SonarrStatus } from './status';
import type { RequestPriority } from '@/shared/types';

export class SonarrLibrary {
  private readonly indexer = new SonarrTitleIndexer();
  private readonly store: SonarrLibraryStore;
  private readonly status: SonarrStatus;

  constructor(
    sonarrClient: SonarrClient,
    mappingResolver: MappingResolver,
    caches: LibraryCaches,
    emitLibraryMutation?: (payload: { tvdbId: number; action: 'added' | 'removed' }) => Promise<void> | void
  ) {
    this.store = new SonarrLibraryStore(sonarrClient, caches, this.indexer);
    this.status = new SonarrStatus(this.store, this.indexer, mappingResolver, sonarrClient, emitLibraryMutation);
  }

  getLeanSeriesList(): Promise<import('./types').LeanSonarrSeries[]> {
    return this.store.getLeanSeriesList();
  }

  refreshCache(optionsOverride?: ExtensionOptions): Promise<import('./types').LeanSonarrSeries[]> {
    return this.store.refreshCache(optionsOverride);
  }

  addSeriesToCache(newSeries: SonarrSeries): Promise<void> {
    return this.store.addSeriesToCache(newSeries);
  }

  removeSeriesFromCache(tvdbId: number): Promise<void> {
    return this.store.removeSeriesFromCache(tvdbId);
  }

  getSeriesStatus(
    payload: CheckSeriesStatusPayload,
    options: { force_verify?: boolean; network?: 'never'; ignoreFailureCache?: boolean; priority?: RequestPriority } = {}
  ): Promise<CheckSeriesStatusResponse> {
    return this.status.getSeriesStatus(payload, options);
  }
}
