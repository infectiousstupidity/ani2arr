import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAni2arrApi } from '@/rpc';
import type {
  CheckSeriesStatusPayload,
  CheckSeriesStatusResponse,
  ExtensionError,
  MappingOverrideRecord,
} from '@/shared/types';
import type {
  ClearMappingIgnoreInput,
  ClearMappingOverrideInput,
  GetMappingsInput,
  GetMappingsOutput,
  SetMappingIgnoreInput,
  SetMappingOverrideInput,
  StatusInput,
} from '@/rpc/schemas';
import { normalizeError } from '@/shared/utils/error-handling';
import { queryKeys } from './query-keys';

export type SeriesStatusOptions = {
  enabled?: boolean;
  force_verify?: boolean;
  network?: 'never';
  ignoreFailureCache?: boolean | (() => boolean);
  priority?: 'high' | 'normal' | (() => 'high' | 'normal' | undefined);
};

export const useSeriesStatus = (payload: CheckSeriesStatusPayload, options?: SeriesStatusOptions) => {
  const forceVerify = options?.force_verify === true;
  return useQuery<CheckSeriesStatusResponse, ExtensionError>({
    queryKey: queryKeys.seriesStatus(payload),
    queryFn: async () => {
      const request: StatusInput = { anilistId: payload.anilistId };
      if (payload.title !== undefined) {
        request.title = payload.title;
      }
      if (payload.metadata !== undefined) {
        request.metadata = payload.metadata;
      }
      if (options?.force_verify) {
        request.force_verify = true;
      }
      if (options?.network) {
        request.network = options.network;
      }
      const bypassFailureCache =
        typeof options?.ignoreFailureCache === 'function'
          ? options.ignoreFailureCache()
          : options?.ignoreFailureCache === true;
      if (bypassFailureCache) {
        request.ignoreFailureCache = true;
      }
      const prio = typeof options?.priority === 'function' ? options.priority() : options?.priority;
      if (prio) {
        request.priority = prio;
      }
      return getAni2arrApi().getSeriesStatus(request);
    },
    enabled: !!payload.anilistId && (options?.enabled ?? true),
    staleTime: forceVerify ? 0 : 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    meta: { persist: false },
  });
};

export const useSetMappingOverride = () => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, ExtensionError, SetMappingOverrideInput>({
    mutationFn: async (input: SetMappingOverrideInput) => {
      try {
        return await getAni2arrApi().setMappingOverride(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverrides() });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
    },
  });
};

export const useClearMappingOverride = () => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, ExtensionError, ClearMappingOverrideInput>({
    mutationFn: async (input: ClearMappingOverrideInput) => {
      try {
        return await getAni2arrApi().clearMappingOverride(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverrides() });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
    },
  });
};

export const useClearAllMappingOverrides = () => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, ExtensionError>({
    mutationFn: async () => {
      try {
        return await getAni2arrApi().clearAllMappingOverrides();
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverrides() });
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusRoot() });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
    },
  });
};

export const useMappingOverrides = () =>
  useQuery<MappingOverrideRecord[], ExtensionError>({
    queryKey: queryKeys.mappingOverrides(),
    queryFn: async () => {
      const api = getAni2arrApi();
      return api.getMappingOverrides();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

export const useSetMappingIgnore = () => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, ExtensionError, SetMappingIgnoreInput>({
    mutationFn: async (input: SetMappingIgnoreInput) => {
      try {
        return await getAni2arrApi().setMappingIgnore(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverrides() });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
    },
  });
};

export const useClearMappingIgnore = () => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, ExtensionError, ClearMappingIgnoreInput>({
    mutationFn: async (input: ClearMappingIgnoreInput) => {
      try {
        return await getAni2arrApi().clearMappingIgnore(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverrides() });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
    },
  });
};

export const useMappings = (input?: GetMappingsInput) =>
  useInfiniteQuery<GetMappingsOutput, ExtensionError>({
    queryKey: queryKeys.mappings(input),
    queryFn: async ({ pageParam }) => {
      const api = getAni2arrApi();
      type MappingCursor = NonNullable<GetMappingsInput>['cursor'];
      const cursor = (pageParam as MappingCursor | undefined) ?? input?.cursor;
      return api.getMappings({
        ...input,
        ...(cursor ? { cursor } : {}),
      });
    },
    initialPageParam: input?.cursor ?? undefined,
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    staleTime: 45 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    meta: { persist: false },
  });
