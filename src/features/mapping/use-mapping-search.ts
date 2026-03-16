import { useQuery } from '@tanstack/react-query';
import { getAni2arrApi } from '@/rpc';
import { queryKeys } from '@/shared/queries';
import { toMappingSearchResultFromRadarr } from './radarr.adapter';
import { toMappingSearchResultFromSonarr } from './sonarr.adapter';
import type { MappingSearchResult, SonarrLookupSeries } from '@/shared/types';
import { usePublicOptions } from '@/shared/queries';
import type { RadarrLookupMovie } from '@/shared/types';

interface UseMappingSearchInput {
  service: 'sonarr' | 'radarr';
  query: string;
  enabled: boolean;
}

export function useMappingSearch(input: UseMappingSearchInput) {
  const q = input.query.trim();
  const enabled = input.enabled && q.length >= 2;
  const publicOptions = usePublicOptions();
  const baseUrl =
    input.service === 'radarr'
      ? publicOptions.data?.providers.radarr.url ?? ''
      : publicOptions.data?.providers.sonarr.url ?? '';

  return useQuery<MappingSearchResult[]>({
    queryKey: queryKeys.mappingSearch(input.service, q),
    enabled,
    queryFn: async () => {
      const api = getAni2arrApi();
      if (input.service === 'radarr') {
        const { results, libraryTmdbIds, linkedAniListIdsByTmdbId } = await api.searchRadarr({ term: q });
        return results.map((result: RadarrLookupMovie) =>
          toMappingSearchResultFromRadarr(result, {
            baseUrl,
            libraryTmdbIds,
            ...(linkedAniListIdsByTmdbId ? { linkedAniListIdsByTmdbId } : {}),
          }),
        );
      }

      const { results, libraryTvdbIds, statsMap, linkedAniListIdsByTvdbId } = await api.searchSonarr({ term: q });
      return results.map((result: SonarrLookupSeries) =>
        toMappingSearchResultFromSonarr(result, {
          baseUrl,
          libraryTvdbIds,
          ...(statsMap ? { statsMap } : {}),
          ...(linkedAniListIdsByTvdbId ? { linkedAniListIdsByTvdbId } : {}),
        }),
      );
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
