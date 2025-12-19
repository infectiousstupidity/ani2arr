import { useQuery } from '@tanstack/react-query';
import { getAni2arrApi } from '@/rpc';
import { queryKeys } from '@/shared/queries';
import { toMappingSearchResultFromSonarr } from './sonarr.adapter';
import type { MappingSearchResult, SonarrLookupSeries } from '@/shared/types';
import { usePublicOptions } from '@/shared/queries';

interface UseMappingSearchInput {
  service: 'sonarr' | 'radarr';
  query: string;
  enabled: boolean;
}

export function useMappingSearch(input: UseMappingSearchInput) {
  const q = input.query.trim();
  const enabled = input.enabled && q.length >= 2 && input.service === 'sonarr';
  const publicOptions = usePublicOptions();
  const baseUrl = publicOptions.data?.sonarrUrl ?? '';

  return useQuery<MappingSearchResult[]>({
    queryKey: queryKeys.mappingSearch(input.service, q),
    enabled,
    queryFn: async () => {
      if (input.service !== 'sonarr') return [];
      const api = getAni2arrApi();
      const { results, libraryTvdbIds, statsMap, linkedAniListIdsByTvdbId } = await api.searchSonarr({ term: q });
      const mapped: MappingSearchResult[] = results.map((r: SonarrLookupSeries) =>
        toMappingSearchResultFromSonarr(r, {
          baseUrl,
          libraryTvdbIds,
          ...(statsMap ? { statsMap } : {}),
          ...(linkedAniListIdsByTvdbId ? { linkedAniListIdsByTvdbId } : {}),
        }),
      );
      return mapped;
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
