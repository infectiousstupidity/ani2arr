import { useQuery } from '@tanstack/react-query';
import { getAni2arrApi } from '@/rpc';
import { normalizeError } from '@/shared/errors/error-utils';
import type { AniMedia, ExtensionError } from '@/shared/types';
import type { GetAniListMetadataOutput } from '@/rpc/schemas';
import { queryKeys, normalizeMetadataIds } from './query-keys';

export const useAniListMedia = (
  anilistId: number | undefined,
  opts?: { enabled?: boolean; forceRefresh?: boolean },
) => {
  const forceRefresh = opts?.forceRefresh ?? false;

  const fetchAniListDirect = async (id: number): Promise<AniMedia | null> => {
    const FIND_MEDIA_QUERY = `
      query FindMedia($id: Int) {
        Media(id: $id) {
          id
          format
          title { romaji english native }
          startDate { year }
          synonyms
          description(asHtml: false)
          episodes
          duration
          nextAiringEpisode { episode airingAt }
          relations { edges { relationType node { id } } }
          bannerImage
          coverImage { extraLarge large medium color }
          status
          season
          seasonYear
          genres
          studios(isMain: true) { nodes { name } }
        }
      }
    `;

    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: FIND_MEDIA_QUERY, variables: { id } }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: { Media?: AniMedia } };
    const media = payload?.data?.Media;
    if (!media) return null;
    // sanitize to plain data for React Query cache safety
    try {
      return JSON.parse(JSON.stringify(media)) as AniMedia;
    } catch {
      return media;
    }
  };

  return useQuery<AniMedia | null, ExtensionError>({
    queryKey: queryKeys.aniListMedia(anilistId ?? 0),
    queryFn: async () => {
      if (!anilistId) return null;
      try {
        const api = getAni2arrApi();
        const media = await api.fetchAniListMedia(anilistId);
        return media ?? null;
      } catch (error) {
        // Fallback to direct AniList fetch if messaging/proxy fails (e.g., DataCloneError)
        const msg = (error as Error | undefined)?.message ?? '';
        if (msg.includes('DataCloneError') || msg.includes('could not be cloned')) {
          const direct = await fetchAniListDirect(anilistId);
          if (direct) return direct;
        }
        const normalized = normalizeError(error);
        console.error('[useAniListMedia] Failed to fetch AniList media:', normalized);
        throw normalized;
      }
    },
    enabled: (opts?.enabled ?? true) && Boolean(anilistId),
    staleTime: forceRefresh ? 0 : 14 * 24 * 60 * 60 * 1000, // 14 days
    gcTime: 60 * 24 * 60 * 60 * 1000, // 60 days
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnMount: forceRefresh ? 'always' : true,
    meta: { persist: false },
  });
};

export const useAniListMetadataBatch = (ids: number[], options?: { enabled?: boolean; refreshStale?: boolean }) => {
  const normalizedIds = normalizeMetadataIds(ids);
  return useQuery<GetAniListMetadataOutput, ExtensionError>({
    queryKey: queryKeys.aniListMetadata(normalizedIds),
    queryFn: async () => {
      const api = getAni2arrApi();
      return api.getAniListMetadata({
        ids: normalizedIds,
        refreshStale: options?.refreshStale ?? true,
      });
    },
    enabled: (options?.enabled ?? true) && normalizedIds.length > 0,
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    meta: { persist: false },
  });
};
