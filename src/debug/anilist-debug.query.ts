import { useQuery } from '@tanstack/react-query';
import { getAni2arrApi } from '@/lib/rpc';
import type { ExtensionError } from '@/shared/types';
import { queryKeys } from '@/shared/queries/query-keys';
import type { AniListSchedulerDebugSnapshot } from './anilist-debug.types';

export const useAniListSchedulerDebug = (options?: { enabled?: boolean; refetchIntervalMs?: number }) => {
  const enabled = options?.enabled ?? true;
  const refetchInterval = options?.refetchIntervalMs ?? 400;

  return useQuery<AniListSchedulerDebugSnapshot, ExtensionError>({
    queryKey: queryKeys.aniListSchedulerDebug(),
    queryFn: () => getAni2arrApi().getAniListSchedulerDebug(),
    enabled,
    refetchInterval: enabled ? refetchInterval : false,
    staleTime: 0,
    gcTime: 30_000,
    refetchOnWindowFocus: false,
    meta: { persist: false },
  });
};
