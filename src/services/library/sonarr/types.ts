// src/services/library/sonarr/types.ts
/** Sonarr library domain contracts and local type re-exports. */
// src/services/library/sonarr/types.ts

import type {
  ExtensionOptions,
  CheckSeriesStatusPayload,
  CheckSeriesStatusResponse,
  RequestPriority,
} from '@/shared/types';
import type {
  SonarrLookupSeries,
  SonarrSeries,
  SonarrSeriesSnapshot,
} from '@/shared/types/providers';
import type {
  LibraryCaches as BaseLibraryCaches,
  LibraryMutationEmitter,
  LibraryStatusOptions,
  LibraryTitleIndexer,
} from '@/services/library/base-library.interface';

export type {
  SonarrLookupSeries,
  SonarrSeries,
  ExtensionOptions,
  CheckSeriesStatusPayload,
  CheckSeriesStatusResponse,
  RequestPriority,
  SonarrSeriesSnapshot,
};

export interface SonarrClient {
  getAllSeries(credentials: { url: string; apiKey: string }): Promise<SonarrSeries[]>;
  getSeriesByTvdbId(tvdbId: number, credentials: { url: string; apiKey: string }): Promise<SonarrSeries | null>;
  lookupSeriesByTvdbId(tvdbId: number, credentials: { url: string; apiKey: string }): Promise<SonarrLookupSeries | null>;
}

export interface MappingResolver {
  resolveTvdbId(
    anilistId: number,
    options?: {
      network?: 'never';
      ignoreFailureCache?: boolean;
      forceLookupNetwork?: boolean;
      priority?: RequestPriority;
      hints?: {
        primaryTitle?: string;
        domMedia?: NonNullable<CheckSeriesStatusPayload['metadata']>;
      };
    }
  ): Promise<{ tvdbId: number; successfulSynonym?: string } | null>;
  prioritizeAniListMedia?(anilistId: number, opts?: { schedule?: boolean }): void;
  getLinkedAniListIdsForTvdb?(tvdbId: number): number[];
}

export interface TitleIndexer extends LibraryTitleIndexer<SonarrSeriesSnapshot> {
  findTvdbIdInIndex(payload: CheckSeriesStatusPayload): number | null;
}

export type LibraryCaches = BaseLibraryCaches<SonarrSeriesSnapshot>;

export type SonarrLibraryStatusOptions = LibraryStatusOptions;

export type LibraryMutationPayload = {
  tvdbId: number;
  action: 'added' | 'removed';
};

export type SonarrLibraryMutationEmitter = LibraryMutationEmitter<LibraryMutationPayload>;
