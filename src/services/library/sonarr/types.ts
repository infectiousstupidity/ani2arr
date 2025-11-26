// src/services/library/sonarr/types.ts
import type { TtlCache } from '@/cache';
import type {
  LeanSonarrSeries,
  SonarrLookupSeries,
  SonarrSeries,
  ExtensionOptions,
  CheckSeriesStatusPayload,
  CheckSeriesStatusResponse,
  RequestPriority,
} from '@/shared/types';

export type {
  LeanSonarrSeries,
  SonarrLookupSeries,
  SonarrSeries,
  ExtensionOptions,
  CheckSeriesStatusPayload,
  CheckSeriesStatusResponse,
  RequestPriority,
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

export interface TitleIndexer {
  reset(): void;
  bulkIndex(list: LeanSonarrSeries[]): void;
  reindex(list: LeanSonarrSeries[]): void;
  findTvdbIdInIndex(payload: CheckSeriesStatusPayload): number | null;
}

export interface LibraryCaches {
  leanSeries: TtlCache<LeanSonarrSeries[]>;
}

export type LibraryMutationPayload = {
  tvdbId: number;
  action: 'added' | 'removed';
};
