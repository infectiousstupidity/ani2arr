import type { UseQueryResult } from '@tanstack/react-query';
import type { MappingSearchResult } from '@/shared/types';

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
