/** Mapping feature-owned view models and controller contracts for manual mapping UI. */
// src/features/mapping/types.ts

import type { UseQueryResult } from '@tanstack/react-query';
import type { Provider } from '@/integrations/providers';
import type { MappingExternalId } from '@/services/mapping/types';

export interface MappingSearchResult {
  provider: Provider;
  target: MappingExternalId;
  title: string;
  year?: number;
  typeLabel?: string;
  inLibrary: boolean;
  librarySlug?: string;
  posterUrl?: string;
  backdropUrl?: string;
  statusLabel?: string;
  networkOrStudio?: string;
  overview?: string;
  alternateTitles?: string[];
  episodeOrMovieCount?: number;
  fileCount?: number;
  linkedAniListIds?: number[];
}

export interface MappingSearchController {
  state: {
    query: string;
    selected: MappingSearchResult | null;
    lastQuery: string;
    isDirty: boolean;
  };
  searchQuery: Pick<UseQueryResult<MappingSearchResult[]>, 'data' | 'isFetching'>;
  setQuery(query: string): void;
  selectResult(result: MappingSearchResult): void;
}

export interface MappingAniListSummary {
  id: number;
  title: string;
  seasonLabel?: string;
  posterUrl?: string;
}
